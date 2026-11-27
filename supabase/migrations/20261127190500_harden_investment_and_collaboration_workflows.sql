-- P05 hardening: investment request identity, investment publication state,
-- and collaboration opportunity initial state / immutable ownership fields.
-- Reviewed against the live Supabase definitions on 2026-11-27.
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
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id
       OR NEW.investor_profile_id IS DISTINCT FROM OLD.investor_profile_id
       OR NEW.requester_user_id IS DISTINCT FROM OLD.requester_user_id
       OR NEW.message IS DISTINCT FROM OLD.message
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION
        'Investment interest request identity, original message and creation time are immutable'
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
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Publishing is a separate, explicit workflow after creation.
    NEW.status := 'draft';
    NEW.published_at := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.investor_profile_id IS DISTINCT FROM OLD.investor_profile_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION
        'Investment opportunity identity and ownership cannot be transferred or rewritten'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
      NEW.published_at := now();
    ELSIF NEW.status <> 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
      NEW.published_at := NULL;
    END IF;
  END IF;

  SELECT verification_status
    INTO v_status
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

CREATE OR REPLACE FUNCTION public.guard_collaboration_opportunity_workflow()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := auth.uid();
    END IF;
    NEW.status := 'draft';
    NEW.created_at := COALESCE(NEW.created_at, now());
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.business_id IS DISTINCT FROM OLD.business_id
       OR NEW.country_code IS DISTINCT FROM OLD.country_code
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION
        'Collaboration opportunity identity, ownership, business and country cannot be changed'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_collaboration_opportunity_workflow
  ON public.collaboration_opportunities;

CREATE TRIGGER guard_collaboration_opportunity_workflow
BEFORE INSERT OR UPDATE ON public.collaboration_opportunities
FOR EACH ROW
EXECUTE FUNCTION public.guard_collaboration_opportunity_workflow();

COMMIT;
