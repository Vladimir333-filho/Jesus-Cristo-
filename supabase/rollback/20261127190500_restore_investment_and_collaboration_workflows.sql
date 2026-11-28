-- Rollback P05 hardening migration.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_investment_interest_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending'
       OR NEW.requester_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION
        'Investment interest requests must start as pending and belong to the authenticated requester'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id
       OR NEW.investor_profile_id IS DISTINCT FROM OLD.investor_profile_id
       OR NEW.requester_user_id IS DISTINCT FROM OLD.requester_user_id THEN
      RAISE EXCEPTION 'Investment interest request ownership cannot be changed'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_investment_opportunity_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_status text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.investor_profile_id IS DISTINCT FROM OLD.investor_profile_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Investment opportunity ownership cannot be transferred'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT verification_status INTO v_status
    FROM public.investor_profiles
   WHERE id = NEW.investor_profile_id
     AND user_id = NEW.created_by;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investor profile does not belong to the opportunity owner'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'published' AND v_status <> 'verified' THEN
    RAISE EXCEPTION 'A verified investor profile is required to publish opportunities'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_collaboration_opportunity_workflow
  ON public.collaboration_opportunities;
DROP FUNCTION IF EXISTS public.guard_collaboration_opportunity_workflow();

COMMIT;
