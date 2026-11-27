-- Rollback for 20261127210000_force_business_opportunity_draft.sql
-- Manual recovery only after review; restores the original update guard and removes insert guard.
begin;
drop trigger if exists business_opportunity_insert_guard on public.business_opportunities;
drop function if exists public.guard_business_opportunity_insert();

create or replace function public.guard_business_opportunity_update()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.business_id is distinct from old.business_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'A propriedade e autoria da oportunidade não podem ser alteradas.';
  end if;
  if new.status='published' and old.status<>'published' then
    if not exists(select 1 from public.businesses b where b.id=new.business_id and b.owner_id=auth.uid() and b.status='approved' and b.verification_status='verified') and not public.is_platform_admin_only() then
      raise exception 'Só empresas aprovadas e verificadas podem publicar oportunidades.';
    end if;
    new.published_at=coalesce(new.published_at,now());
  end if;
  new.updated_at=now();
  return new;
end;
$function$;
commit;
