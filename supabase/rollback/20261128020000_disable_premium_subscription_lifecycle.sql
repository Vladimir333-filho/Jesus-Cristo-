-- P11 rollback: disable Premium lifecycle automation without deleting financial evidence.
-- Intentionally retain business_subscriptions, facipay_checkout_reservations,
-- payment rows, subscription periods and all audit history.
-- Do not drop or truncate these tables during rollback.

BEGIN;

DROP TRIGGER IF EXISTS payments_apply_premium_subscription ON public.payments;

DROP FUNCTION IF EXISTS public.apply_business_premium_payment();
DROP FUNCTION IF EXISTS public.reserve_facipay_premium_checkout(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.finalize_facipay_premium_checkout(uuid, text);
DROP FUNCTION IF EXISTS public.fail_facipay_premium_checkout(uuid);
DROP FUNCTION IF EXISTS public.expire_business_premium_subscriptions();

-- The tables and their rows remain available for forensic review/reconciliation.
-- Application code and the scheduled job must be rolled back together.

COMMIT;
