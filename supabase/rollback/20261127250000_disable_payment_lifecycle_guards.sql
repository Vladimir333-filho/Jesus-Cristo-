-- P08 rollback: disable the new payment guard/audit triggers and functions.
-- Intentionally retain additive columns, constraints, index and payment_audit rows.
-- Financial history is evidence and must not be deleted by a rollback.

BEGIN;

DROP TRIGGER IF EXISTS payments_lifecycle_audit ON public.payments;
DROP TRIGGER IF EXISTS payments_integrity_guard ON public.payments;

DROP FUNCTION IF EXISTS public.audit_payment_lifecycle();
DROP FUNCTION IF EXISTS public.guard_payment_integrity();

-- Keep public.payment_audit and all payment metadata intact for forensic review.
-- Keep validated CHECK constraints and the idempotency index; removing them
-- could re-admit invalid financial data while leaving the integration columns.

COMMIT;
