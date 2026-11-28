-- P12: enforce server-side authorization and preserve administrator reasons
-- for business approval, rejection and suspension.
-- Prepared on the security branch only; validate before applying to production.

BEGIN;

CREATE OR REPLACE FUNCTION public.audit_business_governance_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_country text;
  v_action text;
  v_metadata jsonb;
BEGIN
  IF TG_TABLE_NAME = 'businesses' THEN
    v_country := NEW.country_code;
    v_action := CASE
      WHEN OLD.status IS DISTINCT FROM NEW.status
        OR OLD.verification_status IS DISTINCT FROM NEW.verification_status
      THEN 'business_verification_state_changed'
      ELSE 'business_critical_fields_changed'
    END;
    v_metadata := pg_catalog.jsonb_build_object(
      'changed_fields', pg_catalog.to_jsonb(ARRAY(
        SELECT fields.field_name
        FROM pg_catalog.unnest(ARRAY['owner_id','status','verification_status','approved_at','plan','is_featured']) AS fields(field_name)
        WHERE (pg_catalog.to_jsonb(OLD)->fields.field_name) IS DISTINCT FROM (pg_catalog.to_jsonb(NEW)->fields.field_name)
      )),
      'previous_status', OLD.status,
      'next_status', NEW.status,
      'previous_verification_status', OLD.verification_status,
      'next_verification_status', NEW.verification_status,
      'reason', NULLIF(pg_catalog.current_setting('app.business_audit_reason', true), '')
    );
    INSERT INTO public.access_audit(actor_id,action,resource,resource_id,country_code,metadata)
    VALUES (v_actor,v_action,'businesses',NEW.id::text,v_country,v_metadata);
  ELSIF TG_TABLE_NAME = 'business_documents' THEN
    SELECT b.country_code INTO v_country
    FROM public.businesses b WHERE b.id = NEW.business_id;
    v_action := 'business_document_reviewed';
    v_metadata := pg_catalog.jsonb_build_object(
      'business_id',NEW.business_id,
      'document_type',NEW.document_type,
      'previous_status',OLD.status,
      'next_status',NEW.status,
      'reviewed_by',NEW.reviewed_by
    );
    INSERT INTO public.access_audit(actor_id,action,resource,resource_id,country_code,metadata)
    VALUES (v_actor,v_action,'business_documents',NEW.id::text,v_country,v_metadata);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_transition_business_state(
  p_business_id uuid,
  p_next_status text,
  p_next_verification_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_business public.businesses%ROWTYPE;
  v_is_publishing boolean;
  v_reason text := NULLIF(pg_catalog.btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin_only() THEN
    RAISE EXCEPTION 'Apenas o Administrador Global pode moderar empresas'
      USING ERRCODE = '42501';
  END IF;

  IF p_business_id IS NULL
     OR p_next_status IS NULL
     OR p_next_verification_status IS NULL
     OR p_next_status NOT IN ('pending', 'approved', 'rejected', 'suspended')
     OR p_next_verification_status NOT IN ('unverified', 'under_review', 'verified', 'rejected') THEN
    RAISE EXCEPTION 'Transição de estado inválida'
      USING ERRCODE = '22023';
  END IF;

  IF (p_next_status = 'approved' AND p_next_verification_status <> 'verified')
     OR (p_next_status IN ('rejected', 'suspended') AND p_next_verification_status NOT IN ('unverified', 'rejected'))
     OR (p_next_status = 'pending' AND p_next_verification_status NOT IN ('unverified', 'under_review')) THEN
    RAISE EXCEPTION 'O estado de verificação não corresponde à decisão administrativa'
      USING ERRCODE = '23514';
  END IF;

  IF p_next_status IN ('rejected', 'suspended') AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Indique uma justificação para rejeitar ou suspender a empresa'
      USING ERRCODE = '23514';
  END IF;

  IF v_reason IS NOT NULL AND pg_catalog.char_length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'A justificação excede o limite permitido'
      USING ERRCODE = '22023';
  END IF;

  v_is_publishing := p_next_status = 'approved' AND p_next_verification_status = 'verified';
  PERFORM pg_catalog.set_config('app.business_audit_reason', COALESCE(v_reason, ''), true);

  UPDATE public.businesses
     SET status = p_next_status,
         verification_status = p_next_verification_status,
         approved_at = CASE
           WHEN v_is_publishing THEN COALESCE(approved_at, now())
           ELSE approved_at
         END
   WHERE id = p_business_id
   RETURNING * INTO v_business;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa não encontrada' USING ERRCODE = 'P0002';
  END IF;

  RETURN pg_catalog.to_jsonb(v_business);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_transition_business_state(uuid, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transition_business_state(uuid, text, text, text)
  TO authenticated;

COMMIT;
