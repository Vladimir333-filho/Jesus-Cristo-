-- Rollback delegation hardening. Restores the previously inspected member guard
-- and generic audit triggers. New agenda/outcome integrity triggers are removed.
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
  v_manager_can_manage boolean := false;
BEGIN
  IF COALESCE(auth.role(), '') IN ('service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF (SELECT auth.uid()) IS DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;
  SELECT d.created_by, d.origin_country_code, d.destination_country_code
    INTO v_created_by, v_origin_country_code, v_destination_country_code
    FROM public.trade_delegations AS d
   WHERE d.id = OLD.delegation_id;
  IF v_created_by = (SELECT auth.uid())
     OR public.can_manage_connect_country(v_origin_country_code)
     OR public.can_manage_connect_country(v_destination_country_code) THEN
    RETURN NEW;
  END IF;
  IF OLD.participation_status IS DISTINCT FROM 'invited'
     OR NEW.participation_status NOT IN ('accepted', 'declined')
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.delegation_id IS DISTINCT FROM OLD.delegation_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.organisation_name IS DISTINCT FROM OLD.organisation_name
     OR NEW.member_role IS DISTINCT FROM OLD.member_role
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'Invited members may only accept or decline their own invitation; other participation fields are protected'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_delegation_agenda_integrity ON public.delegation_agenda;
DROP FUNCTION IF EXISTS public.guard_delegation_agenda_integrity();
DROP TRIGGER IF EXISTS guard_delegation_outcome_integrity ON public.delegation_outcomes;
DROP FUNCTION IF EXISTS public.guard_delegation_outcome_integrity();

DROP TRIGGER IF EXISTS audit_delegation_record_change ON public.delegation_agenda;
CREATE TRIGGER audit_connect_africa_change
AFTER INSERT OR UPDATE OR DELETE ON public.delegation_agenda
FOR EACH ROW EXECUTE FUNCTION public.audit_connect_africa_change();

DROP TRIGGER IF EXISTS audit_delegation_record_change ON public.delegation_members;
CREATE TRIGGER audit_connect_africa_change
AFTER INSERT OR UPDATE OR DELETE ON public.delegation_members
FOR EACH ROW EXECUTE FUNCTION public.audit_connect_africa_change();

DROP TRIGGER IF EXISTS audit_delegation_record_change ON public.delegation_outcomes;
CREATE TRIGGER audit_connect_africa_change
AFTER INSERT OR UPDATE OR DELETE ON public.delegation_outcomes
FOR EACH ROW EXECUTE FUNCTION public.audit_connect_africa_change();

DROP FUNCTION IF EXISTS public.audit_delegation_record_change();

COMMIT;
