-- P04: accepting a connection request must never reactivate a blocked/ended connection.
-- Apply only after verified backup and isolated workflow tests.
begin;

create or replace function public.sync_business_connection_after_accept()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requester_owner uuid;
  target_owner uuid;
  company_low uuid;
  company_high uuid;
  existing_connection_status text;
begin
  if new.status = 'accepted' and old.status = 'pending' then
    select owner_id into requester_owner
    from public.businesses where id = new.requester_business_id;

    select owner_id into target_owner
    from public.businesses where id = new.target_business_id;

    company_low := least(new.requester_business_id, new.target_business_id);
    company_high := greatest(new.requester_business_id, new.target_business_id);

    -- Preserve blocked/ended states: never use ON CONFLICT DO UPDATE to reactivate.
    insert into public.business_connections(company_a_id, company_b_id, source_request_id, status)
    values (company_low, company_high, new.id, 'active')
    on conflict (company_a_id, company_b_id) do nothing;

    select status into existing_connection_status
    from public.business_connections
    where company_a_id = company_low
      and company_b_id = company_high
    for update;

    if existing_connection_status is distinct from 'active' then
      raise exception 'Já existe uma conexão bloqueada ou terminada entre estas empresas. É necessária revisão administrativa antes de aceitar um novo pedido.';
    end if;

    insert into public.notifications(
      recipient_id, actor_id, business_id, event_type, entity_table, entity_id, title, body, metadata
    )
    values
      (requester_owner, auth.uid(), new.requester_business_id, 'connection_accepted',
       'connection_requests', new.id::text, 'Pedido de conexão aceite',
       'A outra empresa aceitou o teu pedido de conexão.',
       jsonb_build_object('connection_request_id', new.id)),
      (target_owner, auth.uid(), new.target_business_id, 'connection_accepted',
       'connection_requests', new.id::text, 'Conexão comercial estabelecida',
       'A conexão comercial foi estabelecida.',
       jsonb_build_object('connection_request_id', new.id))
    on conflict do nothing;
  end if;

  return new;
end;
$function$;

commit;
