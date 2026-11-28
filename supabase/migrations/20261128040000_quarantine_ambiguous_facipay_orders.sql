-- P13: preserve ambiguous FaciPay provider-order outcomes for reconciliation.
-- Prevent a timeout/failed finalization from silently releasing a second charge.
-- Prepared on the security branch only; validate before applying to production.

BEGIN;

ALTER TABLE public.facipay_checkout_reservations
  DROP CONSTRAINT IF EXISTS facipay_checkout_reservations_status_check;

ALTER TABLE public.facipay_checkout_reservations
  ADD CONSTRAINT facipay_checkout_reservations_status_check
  CHECK (status IN ('creating', 'ready', 'consumed', 'cancelled', 'failed', 'expired', 'reconciliation'));

DROP INDEX IF EXISTS public.facipay_one_open_checkout_per_business_uidx;
CREATE UNIQUE INDEX facipay_one_open_checkout_per_business_uidx
  ON public.facipay_checkout_reservations (business_id)
  WHERE status IN ('creating', 'ready', 'reconciliation');

-- A provider request may have succeeded even if the response timed out.
-- Such reservations must be reviewed, not automatically released.
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

  -- A stale request whose outcome is unknown is quarantined for reconciliation.
  UPDATE public.facipay_checkout_reservations
     SET status = 'reconciliation', updated_at = now()
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
     AND status IN ('creating', 'ready', 'reconciliation')
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
    ELSIF v_existing.status = 'reconciliation' THEN
      RAISE EXCEPTION 'Existe uma ordem FaciPay com resultado incerto; exige reconciliação antes de nova cobrança'
        USING ERRCODE = '55P03';
    ELSE
      RAISE EXCEPTION 'Já existe um checkout a ser preparado para esta empresa'
        USING ERRCODE = '55P03';
    END IF;
  END IF;

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

CREATE OR REPLACE FUNCTION public.mark_facipay_premium_checkout_reconciliation(
  p_reservation_id uuid,
  p_reference_number text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas o servidor pode marcar uma ordem para reconciliação'
      USING ERRCODE = '42501';
  END IF;

  IF p_reservation_id IS NULL
     OR (p_reference_number IS NOT NULL AND
         (char_length(btrim(p_reference_number)) NOT BETWEEN 1 AND 200
          OR p_reference_number <> btrim(p_reference_number))) THEN
    RAISE EXCEPTION 'Dados de reconciliação inválidos' USING ERRCODE = '22023';
  END IF;

  UPDATE public.facipay_checkout_reservations
     SET status = 'reconciliation',
         reference_number = COALESCE(p_reference_number, reference_number),
         updated_at = now()
   WHERE id = p_reservation_id
     AND status IN ('creating', 'ready');
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_facipay_premium_checkout_reconciliation(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_facipay_premium_checkout_reconciliation(uuid, text)
  TO service_role;

COMMIT;
