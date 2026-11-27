-- P06: protect CRM customer identity and catalog governance fields.
-- Existing RLS policies and grants are intentionally unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_business_customer_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := auth.uid();
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.business_id IS DISTINCT FROM OLD.business_id
       OR NEW.source_lead_id IS DISTINCT FROM OLD.source_lead_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION
        'Customer identity, business linkage, source lead and creator are immutable'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_business_customer_integrity
  ON public.business_customers;
CREATE TRIGGER guard_business_customer_integrity
BEFORE INSERT OR UPDATE ON public.business_customers
FOR EACH ROW EXECUTE FUNCTION public.guard_business_customer_integrity();

CREATE OR REPLACE FUNCTION public.guard_business_catalog_governance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_featured IS TRUE
       AND NOT public.is_platform_admin_only() THEN
      RAISE EXCEPTION 'Only platform administrators may feature catalog items'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.business_id IS DISTINCT FROM OLD.business_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION
        'Catalog item identity, business linkage and creation time are immutable'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.is_featured IS DISTINCT FROM OLD.is_featured
       AND NOT public.is_platform_admin_only() THEN
      RAISE EXCEPTION 'Only platform administrators may change featured status'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_business_catalog_governance
  ON public.business_catalog_items;
CREATE TRIGGER guard_business_catalog_governance
BEFORE INSERT OR UPDATE ON public.business_catalog_items
FOR EACH ROW EXECUTE FUNCTION public.guard_business_catalog_governance();

COMMIT;
