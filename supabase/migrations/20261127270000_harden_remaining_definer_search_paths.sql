-- Harden remaining SECURITY DEFINER functions against object shadowing.
-- This changes function configuration only; bodies, trigger wiring and grants remain unchanged.
-- All referenced application objects in these functions are schema-qualified.

ALTER FUNCTION public.audit_connect_africa_change()
  SET search_path = '';

ALTER FUNCTION public.audit_connect_manager_invitation()
  SET search_path = '';

ALTER FUNCTION public.handle_new_user()
  SET search_path = '';

ALTER FUNCTION public.prevent_profile_role_self_change()
  SET search_path = '';

ALTER FUNCTION public.guard_investment_interest_workflow()
  SET search_path = '';

ALTER FUNCTION public.guard_investment_opportunity_workflow()
  SET search_path = '';

ALTER FUNCTION public.guard_investor_profile_verification()
  SET search_path = '';
