-- Rollback P06 atomic business/private registration RPCs.
BEGIN;
REVOKE ALL ON FUNCTION public.register_business_with_private(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_pending_business_with_private(uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.register_business_with_private(jsonb,jsonb);
DROP FUNCTION IF EXISTS public.update_pending_business_with_private(uuid,jsonb,jsonb);
COMMIT;
