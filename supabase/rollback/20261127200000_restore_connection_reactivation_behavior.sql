-- Rollback for 20261127200000_prevent_connection_reactivation.sql
-- Restores the previous trigger function body. Manual use only after review.
create or replace function public.sync_business_connection_after_accept()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  requester_owner uuid;
  target_owner uuid;
  company_low uuid;
  company_high uuid;
begin
  if new.status='accepted' and old.status='pending' then
    select owner_id into requester_owner from public.businesses where id=new.requester_business_id;
    select owner_id into target_owner from public.businesses where id=new.target_business_id;
    company_low=least(new.requester_business_id,new.target_business_id);
    company_high=greatest(new.requester_business_id,new.target_business_id);
    insert into public.business_connections(company_a_id,company_b_id,source_request_id,status)
    values(company_low,company_high,new.id,'active')
    on conflict(company_a_id,company_b_id) do update set status='active',updated_at=now();
    insert into public.notifications(recipient_id,actor_id,business_id,event_type,entity_table,entity_id,title,body,metadata)
    values
      (requester_owner,auth.uid(),new.requester_business_id,'connection_accepted','connection_requests',new.id::text,'Pedido de conexão aceite','A outra empresa aceitou o teu pedido de conexão.',jsonb_build_object('connection_request_id',new.id)),
      (target_owner,auth.uid(),new.target_business_id,'connection_accepted','connection_requests',new.id::text,'Conexão comercial estabelecida','A conexão comercial foi estabelecida.',jsonb_build_object('connection_request_id',new.id))
    on conflict do nothing;
  end if;
  return new;
end;
$function$;
