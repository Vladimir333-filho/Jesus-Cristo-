-- P05: harden delegation agenda, member identity and outcome attribution.
-- Existing RLS policies remain unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_delegation_member_self_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_created_by uuid;
  v_origin_country_code text;
  v_destination_country_code text;
BEGIN
  -- Identity/linkage is immutable for everyone, including delegation managers.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.delegation_id IS DISTINCT FROM OLD.delegation_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Delegation member identity and linkage fields are immutable'
      USING ERRCODE = '42501';
  END IF;

  -- Backend service operations retain the existing workflow.
  IF COALESCE(auth.role(), '') IN ('service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Non-member changes are governed by existing RLS and manager policies.
  IF (SELECT auth.uid()) IS DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  SELECT d.created_by, d.origin_country_code, d.destination_country_code
    INTO v_created_by, v_origin_country_code, v_destination_country_code
    FROM public.trade_delegations AS d
   WHERE d.id = OLD.delegation_id;

  -- Creator or authorized country manager keeps management capability.
  IF v_created_by = (SELECT auth.uid())
     OR public.can_manage_connect_country(v_origin_country_code)
     OR public.can_manage_connect_country(v_destination_country_code) THEN
    RETURN NEW;
  END IF;

  -- Invitee can only accept/decline their own outstanding invitation.
  IF OLD.participation_status IS DISTINCT FROM 'invited'
     OR NEW.participation_status NOT IN ('accepted', 'declined')
     OR NEW.organisation_name IS DISTINCT FROM OLD.organisation_name
     OR NEW.member_role IS DISTINCT FROM OLD.member_role THEN
    RAISE EXCEPTION
      'Invited members may only accept or decline their own invitation'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_delegation_agenda_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.status := 'planned';
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.delegation_id IS DISTINCT FROM OLD.delegation_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Delegation agenda identity and parent delegation are immutable'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_delegation_agenda_integrity
  ON public.delegation_agenda;
CREATE TRIGGER guard_delegation_agenda_integrity
BEFORE INSERT OR UPDATE ON public.delegation_agenda
FOR EACH ROW EXECUTE FUNCTION public.guard_delegation_agenda_integrity();

CREATE OR REPLACE FUNCTION public.guard_delegation_outcome_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.recorded_by := auth.uid();
    END IF;
    NEW.created_at := COALESCE(NEW.created_at, now());
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.delegation_id IS DISTINCT FROM OLD.delegation_id
       OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Delegation outcome identity and attribution are immutable'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_delegation_outcome_integrity
  ON public.delegation_outcomes;
CREATE TRIGGER guard_delegation_outcome_integrity
BEFORE INSERT OR UPDATE ON public.delegation_outcomes
FOR EACH ROW EXECUTE FUNCTION public.guard_delegation_outcome_integrity();

CREATE OR REPLACE FUNCTION public.audit_delegation_record_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_country text;
  v_id text;
  v_action text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old := to_jsonb(OLD);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new := to_jsonb(NEW);
  END IF;
  v_row := COALESCE(v_new, v_old);
  v_country := COALESCE(v_row->>'country_code', v_row->>'origin_country_code',
                        v_row->>'destination_country_code');
  v_id := v_row->>'id';
  v_action := 'delegation.' || lower(TG_OP);

  INSERT INTO public.access_audit(actor_id, action, resource, resource_id,
                                  country_code, metadata)
  VALUES (
    auth.uid(), v_action, TG_TABLE_NAME, v_id, v_country,
    jsonb_build_object('operation', TG_OP,
                       'before', v_old,
                       'after', v_new)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- Replace generic audit triggers only on delegation records, preserving
-- all other tables' existing audit behaviour.
DROP TRIGGER IF EXISTS audit_connect_africa_change ON public.delegation_agenda;
CREATE TRIGGER audit_delegation_record_change
AFTER INSERT OR UPDATE OR DELETE ON public.delegation_agenda
FOR EACH ROW EXECUTE FUNCTION public.audit_delegation_record_change();

DROP TRIGGER IF EXISTS audit_connect_africa_change ON public.delegation_members;
CREATE TRIGGER audit_delegation_record_change
AFTER INSERT OR UPDATE OR DELETE ON public.delegation_members
FOR EACH ROW EXECUTE FUNCTION public.audit_delegation_record_change();

DROP TRIGGER IF EXISTS audit_connect_africa_change ON public.delegation_outcomes;
CREATE TRIGGER audit_delegation_record_change
AFTER INSERT OR UPDATE OR DELETE ON public.delegation_outcomes
FOR EACH ROW EXECUTE FUNCTION public.audit_delegation_record_change();

COMMIT;
