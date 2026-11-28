-- P12 rollback: restore the previous governance audit trigger function
-- and remove the new admin RPC. Existing access_audit rows are preserved.

BEGIN;

DROP FUNCTION IF EXISTS public.admin_transition_business_state(uuid, text, text, text);

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
      'next_verification_status', NEW.verification_status
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

COMMIT;
