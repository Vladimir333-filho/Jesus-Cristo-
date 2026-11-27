-- Rollback P06 customer/catalog guard triggers.
BEGIN;
DROP TRIGGER IF EXISTS guard_business_customer_integrity ON public.business_customers;
DROP FUNCTION IF EXISTS public.guard_business_customer_integrity();
DROP TRIGGER IF EXISTS guard_business_catalog_governance ON public.business_catalog_items;
DROP FUNCTION IF EXISTS public.guard_business_catalog_governance();
COMMIT;
