-- P08: financial integrity, payment state machine and append-only audit.
-- Prepared for review only. Do not apply to production before backup/staging validation.

BEGIN;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS external_transaction_id text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS refunded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_period_order_check
    CHECK (period_start IS NULL OR period_end IS NULL OR period_start <= period_end) NOT VALID,
  ADD CONSTRAINT payments_amount_integer_check
    CHECK (amount_aoa = trunc(amount_aoa)) NOT VALID,
  ADD CONSTRAINT payments_provider_check
    CHECK (provider IS NULL OR provider IN ('facipay')) NOT VALID,
  ADD CONSTRAINT payments_provider_status_check
    CHECK (provider_status IS NULL OR provider_status IN ('PEN', 'CON', 'CAN')) NOT VALID,
  ADD CONSTRAINT payments_external_transaction_pair_check
    CHECK ((provider IS NULL AND external_transaction_id IS NULL)
        OR (provider IS NOT NULL AND external_transaction_id IS NOT NULL)) NOT VALID,
  ADD CONSTRAINT payments_external_transaction_id_length_check
    CHECK (external_transaction_id IS NULL OR char_length(btrim(external_transaction_id)) BETWEEN 1 AND 200) NOT VALID,
  ADD CONSTRAINT payments_provider_status_requires_provider_check
    CHECK (provider_status IS NULL OR provider = 'facipay') NOT VALID,
  ADD CONSTRAINT payments_review_reason_length_check
    CHECK (review_reason IS NULL OR char_length(review_reason) <= 1000) NOT VALID;

ALTER TABLE public.payments
  VALIDATE CONSTRAINT payments_period_order_check,
  VALIDATE CONSTRAINT payments_amount_integer_check,
  VALIDATE CONSTRAINT payments_provider_check,
  VALIDATE CONSTRAINT payments_provider_status_check,
  VALIDATE CONSTRAINT payments_external_transaction_pair_check,
  VALIDATE CONSTRAINT payments_external_transaction_id_length_check,
  VALIDATE CONSTRAINT payments_provider_status_requires_provider_check,
  VALIDATE CONSTRAINT payments_review_reason_length_check;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_external_transaction_uidx
  ON public.payments (provider, external_transaction_id)
  WHERE provider IS NOT NULL AND external_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('submitted', 'provider_update', 'confirmed', 'rejected', 'refunded')),
  old_status text,
  new_status text,
  old_provider_status text,
  new_provider_status text,
  source text NOT NULL CHECK (source IN ('owner', 'admin', 'facipay_webhook', 'system')),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_audit_payment_created_idx
  ON public.payment_audit (payment_id, created_at DESC);

ALTER TABLE public.payment_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payment_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.payment_audit TO authenticated;
DROP POLICY IF EXISTS payment_audit_admin_read ON public.payment_audit;
CREATE POLICY payment_audit_admin_read
  ON public.payment_audit
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin_only());

CREATE OR REPLACE FUNCTION public.guard_payment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_is_service boolean := COALESCE(auth.role(), '') IN ('service_role', 'supabase_admin');
  v_is_admin boolean := public.is_platform_admin_only();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending'
       OR NEW.confirmed_at IS NOT NULL
       OR NEW.confirmed_by IS NOT NULL
       OR NEW.refunded_at IS NOT NULL
       OR NEW.refunded_by IS NOT NULL THEN
      RAISE EXCEPTION 'Novos pagamentos devem ser submetidos como pendentes'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.review_reason IS NOT NULL THEN
      RAISE EXCEPTION 'O motivo de revisão só pode ser registado durante uma decisão administrativa'
        USING ERRCODE = '42501';
    END IF;

    IF NOT v_is_service
       AND (NEW.provider IS NOT NULL
         OR NEW.external_transaction_id IS NOT NULL
         OR NEW.provider_status IS NOT NULL) THEN
      RAISE EXCEPTION 'Os dados de integração do fornecedor são reservados ao servidor'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  -- A payment is a financial record: its commercial identity and amount never
  -- change in place, even for administrators. Corrections require a separate
  -- audited workflow rather than rewriting the original transaction.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.business_id IS DISTINCT FROM OLD.business_id
     OR NEW.amount_aoa IS DISTINCT FROM OLD.amount_aoa
     OR NEW.method IS DISTINCT FROM OLD.method
     OR NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.proof_path IS DISTINCT FROM OLD.proof_path
     OR NEW.period_start IS DISTINCT FROM OLD.period_start
     OR NEW.period_end IS DISTINCT FROM OLD.period_end
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Os dados financeiros originais do pagamento são imutáveis'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.provider IS DISTINCT FROM OLD.provider)
     OR (NEW.external_transaction_id IS DISTINCT FROM OLD.external_transaction_id)
     OR (NEW.provider_status IS DISTINCT FROM OLD.provider_status) THEN
    IF NOT v_is_service THEN
      RAISE EXCEPTION 'Só o servidor pode alterar dados de transacção do fornecedor'
        USING ERRCODE = '42501';
    END IF;
    IF OLD.provider IS NOT NULL AND NEW.provider IS DISTINCT FROM OLD.provider THEN
      RAISE EXCEPTION 'O fornecedor associado ao pagamento não pode ser substituído'
        USING ERRCODE = '42501';
    END IF;
    IF OLD.external_transaction_id IS NOT NULL
       AND NEW.external_transaction_id IS DISTINCT FROM OLD.external_transaction_id THEN
      RAISE EXCEPTION 'O identificador externo da transacção é imutável'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.review_reason IS DISTINCT FROM OLD.review_reason THEN
    IF NOT v_is_admin OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'O motivo só pode ser registado por um administrador durante uma transição de estado'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'pending' AND NEW.status = 'confirmed' THEN
      IF v_is_service THEN
        IF NEW.provider IS DISTINCT FROM 'facipay'
           OR NEW.external_transaction_id IS NULL
           OR NEW.provider_status IS DISTINCT FROM 'CON' THEN
          RAISE EXCEPTION 'Confirmação automática exige evento FaciPay CON validado'
            USING ERRCODE = '42501';
        END IF;
        NEW.confirmed_by := NULL;
        NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());
        NEW.refunded_by := OLD.refunded_by;
        NEW.refunded_at := OLD.refunded_at;
      ELSIF v_is_admin THEN
        NEW.confirmed_by := auth.uid();
        NEW.confirmed_at := now();
        NEW.refunded_by := OLD.refunded_by;
        NEW.refunded_at := OLD.refunded_at;
      ELSE
        RAISE EXCEPTION 'Sem autorização para confirmar este pagamento'
          USING ERRCODE = '42501';
      END IF;

    ELSIF OLD.status = 'pending' AND NEW.status = 'rejected' THEN
      IF v_is_service THEN
        IF NEW.provider IS DISTINCT FROM 'facipay'
           OR NEW.external_transaction_id IS NULL
           OR NEW.provider_status IS DISTINCT FROM 'CAN' THEN
          RAISE EXCEPTION 'Rejeição automática exige evento FaciPay CAN validado'
            USING ERRCODE = '42501';
        END IF;
        NEW.confirmed_by := NULL;
        NEW.confirmed_at := NULL;
        NEW.refunded_by := OLD.refunded_by;
        NEW.refunded_at := OLD.refunded_at;
      ELSIF v_is_admin THEN
        IF NULLIF(btrim(NEW.review_reason), '') IS NULL THEN
          RAISE EXCEPTION 'Indique o motivo da rejeição do pagamento'
            USING ERRCODE = '23514';
        END IF;
        NEW.confirmed_by := NULL;
        NEW.confirmed_at := NULL;
        NEW.refunded_by := OLD.refunded_by;
        NEW.refunded_at := OLD.refunded_at;
      ELSE
        RAISE EXCEPTION 'Sem autorização para rejeitar este pagamento'
          USING ERRCODE = '42501';
      END IF;

    ELSIF OLD.status = 'confirmed' AND NEW.status = 'refunded' THEN
      IF NOT v_is_admin THEN
        RAISE EXCEPTION 'O estorno exige validação administrativa'
          USING ERRCODE = '42501';
      END IF;
      IF NULLIF(btrim(NEW.review_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Indique o motivo do estorno'
          USING ERRCODE = '23514';
      END IF;
      NEW.confirmed_by := OLD.confirmed_by;
      NEW.confirmed_at := OLD.confirmed_at;
      NEW.refunded_by := auth.uid();
      NEW.refunded_at := now();

    ELSE
      RAISE EXCEPTION 'Transição de estado de pagamento não permitida: % -> %',
        OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
  ELSIF (NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by)
     OR (NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at)
     OR (NEW.refunded_by IS DISTINCT FROM OLD.refunded_by)
     OR (NEW.refunded_at IS DISTINCT FROM OLD.refunded_at) THEN
    RAISE EXCEPTION 'Os metadados de confirmação e estorno são geridos pelo sistema'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_payment_integrity() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS payments_integrity_guard ON public.payments;
CREATE TRIGGER payments_integrity_guard
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_payment_integrity();

CREATE OR REPLACE FUNCTION public.audit_payment_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_source text;
  v_action text;
BEGIN
  IF current_setting('app.payment_audit_source', true) = 'facipay_webhook' THEN
    v_source := 'facipay_webhook';
  ELSIF public.is_platform_admin_only() THEN
    v_source := 'admin';
  ELSIF auth.uid() IS NOT NULL THEN
    v_source := 'owner';
  ELSE
    v_source := 'system';
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.payment_audit (
      payment_id, actor_id, action, new_status, new_provider_status,
      source, metadata
    ) VALUES (
      NEW.id, auth.uid(), 'submitted', NEW.status, NEW.provider_status,
      v_source,
      jsonb_build_object('method', NEW.method, 'amount_aoa', NEW.amount_aoa)
    );
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.provider_status IS NOT DISTINCT FROM OLD.provider_status THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE NEW.status
      WHEN 'confirmed' THEN 'confirmed'
      WHEN 'rejected' THEN 'rejected'
      WHEN 'refunded' THEN 'refunded'
      ELSE 'provider_update'
    END;
  ELSE
    v_action := 'provider_update';
  END IF;

  INSERT INTO public.payment_audit (
    payment_id, actor_id, action, old_status, new_status,
    old_provider_status, new_provider_status, source, reason, metadata
  ) VALUES (
    NEW.id, auth.uid(), v_action, OLD.status, NEW.status,
    OLD.provider_status, NEW.provider_status, v_source, NEW.review_reason,
    jsonb_build_object(
      'provider', NEW.provider,
      'external_transaction_id', NEW.external_transaction_id
    )
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_payment_lifecycle() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS payments_lifecycle_audit ON public.payments;
CREATE TRIGGER payments_lifecycle_audit
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_payment_lifecycle();


-- Atomic, row-locked webhook processor. Only the backend service role may call it.
CREATE OR REPLACE FUNCTION public.apply_facipay_payment_event(
  p_external_transaction_id text,
  p_reference_number text,
  p_amount integer,
  p_payment_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_next_status text;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas o serviço de pagamentos pode processar eventos FaciPay'
      USING ERRCODE = '42501';
  END IF;

  IF p_external_transaction_id IS NULL
     OR char_length(btrim(p_external_transaction_id)) NOT BETWEEN 1 AND 200
     OR p_reference_number IS NULL
     OR char_length(btrim(p_reference_number)) NOT BETWEEN 1 AND 200
     OR p_amount IS NULL OR p_amount <= 0
     OR p_payment_status IS NULL
     OR p_payment_status NOT IN ('PEN', 'CON', 'CAN') THEN
    RAISE EXCEPTION 'Evento FaciPay inválido'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payment
    FROM public.payments
   WHERE provider = 'facipay'
     AND external_transaction_id = p_external_transaction_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('received', true, 'processed', false, 'reason', 'unknown_transaction');
  END IF;

  IF v_payment.amount_aoa <> p_amount
     OR v_payment.reference IS DISTINCT FROM p_reference_number THEN
    RETURN jsonb_build_object('received', true, 'processed', false, 'reason', 'payment_mismatch');
  END IF;

  IF v_payment.status <> 'pending'
     OR v_payment.provider_status IN ('CON', 'CAN') THEN
    RETURN jsonb_build_object('received', true, 'processed', false, 'reason', 'terminal_or_already_processed');
  END IF;

  IF v_payment.provider_status IS NOT DISTINCT FROM p_payment_status THEN
    RETURN jsonb_build_object('received', true, 'processed', false, 'reason', 'duplicate_event');
  END IF;

  v_next_status := CASE p_payment_status
    WHEN 'CON' THEN 'confirmed'
    WHEN 'CAN' THEN 'rejected'
    ELSE 'pending'
  END;

  PERFORM set_config('app.payment_audit_source', 'facipay_webhook', true);

  UPDATE public.payments
     SET provider_status = p_payment_status,
         status = v_next_status
   WHERE id = v_payment.id;

  RETURN jsonb_build_object('received', true, 'processed', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_facipay_payment_event(text, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_facipay_payment_event(text, text, integer, text)
  TO service_role;

COMMIT;
