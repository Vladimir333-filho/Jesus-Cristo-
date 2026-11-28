-- P11: secure Premium subscription lifecycle and server-owned FaciPay checkout reservations.
-- Prepared on the security branch only. Do not apply to production before staged validation.
-- Pricing rule confirmed by the product owner:
--   First Premium activation: 10,000 AOA
--   Every subsequent 3-month renewal: 3,000 AOA

BEGIN;

CREATE TABLE IF NOT EXISTS public.business_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  current_period_start date NOT NULL,
  current_period_end date NOT NULL,
  first_payment_id uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  last_payment_id uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_subscriptions_period_order
    CHECK (current_period_start <= current_period_end)
);

CREATE INDEX IF NOT EXISTS business_subscriptions_expiry_idx
  ON public.business_subscriptions (current_period_end)
  WHERE status = 'active';

ALTER TABLE public.business_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_subscriptions FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.business_subscriptions TO authenticated;
GRANT ALL ON TABLE public.business_subscriptions TO service_role;

DROP POLICY IF EXISTS business_subscriptions_owner_admin_read ON public.business_subscriptions;
CREATE POLICY business_subscriptions_owner_admin_read
  ON public.business_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = business_subscriptions.business_id
        AND (b.owner_id = (SELECT auth.uid()) OR public.is_platform_admin_only())
    )
  );

-- This private table serializes checkout creation and prevents duplicate active
-- references for the same company. Only the trusted server service role can use it.
CREATE TABLE IF NOT EXISTS public.facipay_checkout_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  external_transaction_id text NOT NULL UNIQUE,
  amount_aoa integer NOT NULL CHECK (amount_aoa IN (3000, 10000)),
  period_start date NOT NULL,
  period_end date NOT NULL,
  is_initial boolean NOT NULL,
  status text NOT NULL DEFAULT 'creating'
    CHECK (status IN ('creating', 'ready', 'consumed', 'cancelled', 'failed', 'expired')),
  reference_number text,
  payment_id uuid UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facipay_checkout_period_order
    CHECK (period_start <= period_end),
  CONSTRAINT facipay_checkout_reference_length
    CHECK (reference_number IS NULL OR char_length(btrim(reference_number)) BETWEEN 1 AND 200),
  CONSTRAINT facipay_checkout_ready_fields
    CHECK (status <> 'ready' OR (reference_number IS NOT NULL AND payment_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS facipay_one_open_checkout_per_business_uidx
  ON public.facipay_checkout_reservations (business_id)
  WHERE status IN ('creating', 'ready');

CREATE INDEX IF NOT EXISTS facipay_checkout_owner_created_idx
  ON public.facipay_checkout_reservations (owner_id, created_at DESC);

ALTER TABLE public.facipay_checkout_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.facipay_checkout_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.facipay_checkout_reservations TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_facipay_premium_checkout(
  p_business_id uuid,
  p_owner_id uuid,
  p_external_transaction_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_business public.businesses%ROWTYPE;
  v_subscription public.business_subscriptions%ROWTYPE;
  v_existing public.facipay_checkout_reservations%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Africa/Luanda')::date;
  v_amount integer;
  v_period_start date;
  v_period_end date;
  v_is_initial boolean;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas o servidor pode preparar pagamentos Premium'
      USING ERRCODE = '42501';
  END IF;

  IF p_business_id IS NULL OR p_owner_id IS NULL
     OR p_external_transaction_id IS NULL
     OR char_length(btrim(p_external_transaction_id)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Dados de checkout inválidos' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_business
    FROM public.businesses
   WHERE id = p_business_id AND owner_id = p_owner_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa não encontrada ou sem autorização'
      USING ERRCODE = '42501';
  END IF;

  IF v_business.status <> 'approved'
     OR v_business.verification_status <> 'verified' THEN
    RAISE EXCEPTION 'A empresa precisa de estar aprovada e verificada para aderir ao Premium'
      USING ERRCODE = '23514';
  END IF;

  -- A stale reservation can be closed safely because no payment record/reference
  -- was handed to the customer while it was still in the "creating" state.
  UPDATE public.facipay_checkout_reservations
     SET status = 'failed', updated_at = now()
   WHERE business_id = p_business_id
     AND status = 'creating'
     AND created_at < now() - interval '2 minutes';

  UPDATE public.facipay_checkout_reservations
     SET status = 'expired', updated_at = now()
   WHERE business_id = p_business_id
     AND status = 'ready'
     AND expires_at <= now();

  SELECT * INTO v_existing
    FROM public.facipay_checkout_reservations
   WHERE business_id = p_business_id
     AND status IN ('creating', 'ready')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status = 'ready' THEN
      RETURN jsonb_build_object(
        'reservation_id', v_existing.id,
        'external_transaction_id', v_existing.external_transaction_id,
        'amount_aoa', v_existing.amount_aoa,
        'period_start', v_existing.period_start,
        'period_end', v_existing.period_end,
        'reference_number', v_existing.reference_number,
        'already_ready', true
      );
    END IF;
    RAISE EXCEPTION 'Já existe um checkout a ser preparado para esta empresa'
      USING ERRCODE = '55P03';
  END IF;

  -- Never create a second payable reference while an earlier FaciPay payment
  -- remains pending. Resolve stale references with the provider before retrying.
  IF EXISTS (
    SELECT 1 FROM public.payments p
     WHERE p.business_id = p_business_id
       AND p.provider = 'facipay'
       AND p.status = 'pending'
       AND p.provider_reference IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Existe um pagamento FaciPay pendente. Aguarde a confirmação ou solicite reconciliação.'
      USING ERRCODE = '55P03';
  END IF;

  SELECT * INTO v_subscription
    FROM public.business_subscriptions
   WHERE business_id = p_business_id
   FOR UPDATE;

  v_is_initial := NOT FOUND;

  IF v_is_initial THEN
    IF v_business.plan = 'premium' THEN
      RAISE EXCEPTION 'O plano já está Premium, mas não existe subscrição associada. Exige reconciliação administrativa.'
        USING ERRCODE = '23514';
    END IF;
    v_amount := 10000;
    v_period_start := v_today;
  ELSE
    v_amount := 3000;
    v_period_start := CASE
      WHEN v_subscription.current_period_end >= v_today
        THEN v_subscription.current_period_end + 1
      ELSE v_today
    END;
  END IF;

  v_period_end := (v_period_start + interval '3 months' - interval '1 day')::date;

  INSERT INTO public.facipay_checkout_reservations (
    business_id, owner_id, external_transaction_id, amount_aoa,
    period_start, period_end, is_initial, status, expires_at
  ) VALUES (
    p_business_id, p_owner_id, p_external_transaction_id, v_amount,
    v_period_start, v_period_end, v_is_initial, 'creating', now() + interval '2 minutes'
  )
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object(
    'reservation_id', v_existing.id,
    'external_transaction_id', v_existing.external_transaction_id,
    'amount_aoa', v_existing.amount_aoa,
    'period_start', v_existing.period_start,
    'period_end', v_existing.period_end,
    'already_ready', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_facipay_premium_checkout(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_facipay_premium_checkout(uuid, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_facipay_premium_checkout(
  p_reservation_id uuid,
  p_reference_number text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_reservation public.facipay_checkout_reservations%ROWTYPE;
  v_payment_id uuid;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas o servidor pode finalizar o checkout Premium'
      USING ERRCODE = '42501';
  END IF;

  IF p_reservation_id IS NULL OR p_reference_number IS NULL
     OR char_length(btrim(p_reference_number)) NOT BETWEEN 1 AND 200
     OR p_reference_number <> btrim(p_reference_number) THEN
    RAISE EXCEPTION 'Referência FaciPay inválida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_reservation
    FROM public.facipay_checkout_reservations
   WHERE id = p_reservation_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva de checkout não encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_reservation.status = 'ready' THEN
    RETURN jsonb_build_object(
      'payment_id', v_reservation.payment_id,
      'reference_number', v_reservation.reference_number,
      'already_ready', true
    );
  END IF;

  IF v_reservation.status <> 'creating' OR v_reservation.expires_at <= now() THEN
    RAISE EXCEPTION 'A reserva de checkout expirou ou já foi finalizada'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.payments (
    business_id, amount_aoa, method, status, period_start, period_end,
    provider, external_transaction_id, provider_reference
  ) VALUES (
    v_reservation.business_id, v_reservation.amount_aoa, 'facipay', 'pending',
    v_reservation.period_start, v_reservation.period_end,
    'facipay', v_reservation.external_transaction_id, p_reference_number
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.facipay_checkout_reservations
     SET status = 'ready',
         reference_number = p_reference_number,
         payment_id = v_payment_id,
         expires_at = now() + interval '24 hours',
         updated_at = now()
   WHERE id = p_reservation_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'reference_number', p_reference_number,
    'already_ready', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_facipay_premium_checkout(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_facipay_premium_checkout(uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.fail_facipay_premium_checkout(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas o servidor pode encerrar uma reserva de checkout'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.facipay_checkout_reservations
     SET status = 'failed', updated_at = now()
   WHERE id = p_reservation_id AND status = 'creating';
END;
$function$;

REVOKE ALL ON FUNCTION public.fail_facipay_premium_checkout(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_facipay_premium_checkout(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.apply_business_premium_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_reservation public.facipay_checkout_reservations%ROWTYPE;
  v_subscription public.business_subscriptions%ROWTYPE;
  v_has_subscription boolean;
BEGIN
  IF TG_OP <> 'UPDATE'
     OR OLD.status <> 'pending'
     OR NEW.status NOT IN ('confirmed', 'rejected')
     OR NEW.provider IS DISTINCT FROM 'facipay'
     OR NEW.method IS DISTINCT FROM 'facipay' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_reservation
    FROM public.facipay_checkout_reservations
   WHERE external_transaction_id = NEW.external_transaction_id
   FOR UPDATE;

  IF NOT FOUND
     OR v_reservation.payment_id IS DISTINCT FROM NEW.id
     OR v_reservation.status NOT IN ('ready', 'expired') THEN
    RAISE EXCEPTION 'Reserva de checkout FaciPay não corresponde ao pagamento'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'rejected' AND NEW.provider_status = 'CAN' THEN
    UPDATE public.facipay_checkout_reservations
       SET status = 'cancelled', updated_at = now()
     WHERE id = v_reservation.id;
    RETURN NEW;
  END IF;

  IF NEW.status <> 'confirmed' OR NEW.provider_status IS DISTINCT FROM 'CON' THEN
    RETURN NEW;
  END IF;

  IF NEW.amount_aoa <> v_reservation.amount_aoa
     OR NEW.period_start IS DISTINCT FROM v_reservation.period_start
     OR NEW.period_end IS DISTINCT FROM v_reservation.period_end THEN
    RAISE EXCEPTION 'Pagamento Premium não corresponde ao preço ou período reservado'
      USING ERRCODE = '23514';
  END IF;

  -- Serialize successful activations/renewals for this company.
  PERFORM 1 FROM public.businesses WHERE id = NEW.business_id FOR UPDATE;

  SELECT * INTO v_subscription
    FROM public.business_subscriptions
   WHERE business_id = NEW.business_id
   FOR UPDATE;
  v_has_subscription := FOUND;

  IF v_reservation.is_initial THEN
    IF v_has_subscription OR v_reservation.amount_aoa <> 10000 THEN
      RAISE EXCEPTION 'A adesão inicial Premium já existe ou tem valor inválido'
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.business_subscriptions (
      business_id, status, started_at, current_period_start, current_period_end,
      first_payment_id, last_payment_id
    ) VALUES (
      NEW.business_id, 'active', now(), NEW.period_start, NEW.period_end, NEW.id, NEW.id
    );
  ELSE
    IF NOT v_has_subscription OR v_reservation.amount_aoa <> 3000 THEN
      RAISE EXCEPTION 'A renovação Premium exige uma subscrição existente e o valor correcto'
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.business_subscriptions
       SET status = 'active',
           current_period_start = NEW.period_start,
           current_period_end = NEW.period_end,
           last_payment_id = NEW.id,
           updated_at = now()
     WHERE business_id = NEW.business_id;
  END IF;

  UPDATE public.businesses
     SET plan = 'premium'
   WHERE id = NEW.business_id
     AND plan IS DISTINCT FROM 'premium';

  UPDATE public.facipay_checkout_reservations
     SET status = 'consumed', updated_at = now()
   WHERE id = v_reservation.id;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_business_premium_payment()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS payments_apply_premium_subscription ON public.payments;
CREATE TRIGGER payments_apply_premium_subscription
  AFTER UPDATE OF status ON public.payments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.apply_business_premium_payment();

CREATE OR REPLACE FUNCTION public.expire_business_premium_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Africa/Luanda')::date;
  v_expired_ids uuid[];
  v_count integer;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas o serviço agendado pode expirar subscrições'
      USING ERRCODE = '42501';
  END IF;

  WITH expired AS (
    UPDATE public.business_subscriptions
       SET status = 'expired', updated_at = now()
     WHERE status = 'active' AND current_period_end < v_today
     RETURNING business_id
  )
  SELECT array_agg(business_id), count(*)::integer
    INTO v_expired_ids, v_count
    FROM expired;

  IF COALESCE(array_length(v_expired_ids, 1), 0) > 0 THEN
    UPDATE public.businesses
       SET plan = 'free'
     WHERE id = ANY(v_expired_ids)
       AND plan = 'premium';
  END IF;

  RETURN COALESCE(v_count, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.expire_business_premium_subscriptions()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_business_premium_subscriptions()
  TO service_role;

COMMIT;
