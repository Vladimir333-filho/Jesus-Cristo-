-- P04: force all new business opportunities to start as drafts.
-- Also make the opportunity primary key immutable on update.
-- Apply only after verified backup and isolated workflow tests.
begin;

create or replace function public.guard_business_opportunity_insert()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'É necessário iniciar sessão para criar uma oportunidade.';
  end if;

  -- Never accept caller-supplied authorship or publication state.
  new.created_by := auth.uid();
  new.status := 'draft';
  new.published_at := null;
  new.updated_at := now();

  return new;
end;
$function$;

drop trigger if exists business_opportunity_insert_guard on public.business_opportunities;
create trigger business_opportunity_insert_guard
before insert on public.business_opportunities
for each row execute function public.guard_business_opportunity_insert();

create or replace function public.guard_business_opportunity_update()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.id is distinct from old.id
    or new.business_id is distinct from old.business_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'A identidade, propriedade e autoria da oportunidade não podem ser alteradas.';
  end if;

  if new.status = 'published' and old.status <> 'published' then
    if not exists (
      select 1 from public.businesses b
      where b.id = new.business_id
        and b.owner_id = auth.uid()
        and b.status = 'approved'
        and b.verification_status = 'verified'
    ) and not public.is_platform_admin_only() then
      raise exception 'Só empresas aprovadas e verificadas podem publicar oportunidades.';
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

commit;
