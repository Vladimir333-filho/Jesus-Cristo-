-- P09: harden the country-manager RLS helper.
-- SECURITY DEFINER is intentional: the helper is used inside RLS policies and
-- must evaluate assignments without recursive assignment-table RLS filtering.
-- All referenced objects are schema-qualified and the search_path is empty.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_manage_connect_country(p_country_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    public.is_platform_admin_only()
    OR EXISTS (
      SELECT 1
      FROM public.connect_manager_assignments AS a
      WHERE a.user_id = (SELECT auth.uid())
        AND a.country_code = p_country_code
        AND a.status = 'active'
        AND a.manager_role IN ('national_admin', 'connect_manager')
    );
$function$;

REVOKE ALL ON FUNCTION public.can_manage_connect_country(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_connect_country(text) TO authenticated, service_role;

COMMIT;
