-- P05: validate event registration at insertion and enforce capacity atomically.
-- New registrations are always registered or waitlisted; clients cannot self-assign
-- attended/no_show/cancelled or bypass event publication/deadline/capacity.
-- Apply only after verified backup and isolated workflow tests.
begin;

create or replace function public.guard_event_registration_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event public.events%rowtype;
  v_registered_count integer;
begin
  if auth.uid() is null then
    raise exception 'É necessário iniciar sessão para se inscrever.';
  end if;

  -- The row lock serializes registrations for the same event, preventing
  -- concurrent requests from exceeding capacity.
  select * into v_event
  from public.events
  where id = new.event_id
  for update;

  if not found
     or v_event.status <> 'published'
     or v_event.visibility <> 'public'
     or (v_event.registration_deadline is not null and v_event.registration_deadline <= now()) then
    raise exception 'Este evento não está disponível para inscrições.';
  end if;

  new.user_id := auth.uid();
  new.registration_status := 'registered';
  new.registered_at := now();

  if v_event.capacity is not null then
    select count(*)::integer into v_registered_count
    from public.event_registrations
    where event_id = new.event_id
      and registration_status = 'registered';

    if v_registered_count >= v_event.capacity then
      new.registration_status := 'waitlisted';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists event_registration_insert_guard on public.event_registrations;
create trigger event_registration_insert_guard
before insert on public.event_registrations
for each row execute function public.guard_event_registration_insert();

commit;
