-- Rollback for 20261127190000_harden_manager_invitation_acceptance.sql
-- Restores the prior function body. Use only if rollback is approved and no dependent
-- changes have superseded this function.
create or replace function public.accept_connect_manager_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email','')));
  v_inv public.connect_manager_invitations%rowtype;
  v_assignment_id uuid;
begin
  if v_uid is null or v_email = '' then
    raise exception 'É necessário iniciar sessão para aceitar o convite.';
  end if;
  if p_token is null or length(p_token) < 32 or length(p_token) > 256 then
    raise exception 'Convite inválido ou expirado.';
  end if;

  select * into v_inv
  from public.connect_manager_invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found or v_inv.status <> 'pending' or v_inv.expires_at <= now()
     or lower(v_inv.invited_email) <> v_email then
    raise exception 'Convite inválido, expirado, já utilizado ou destinado a outro email.';
  end if;

  update public.connect_manager_invitations
     set status = 'accepted',
         accepted_by = v_uid,
         accepted_at = now(),
         activated_at = now(),
         updated_at = now()
   where id = v_inv.id;

  select id into v_assignment_id
  from public.connect_manager_assignments
  where user_id = v_uid
    and country_code = v_inv.country_code
    and manager_role = v_inv.invited_role
  order by assigned_at desc
  limit 1
  for update;

  if v_assignment_id is null then
    insert into public.connect_manager_assignments
      (user_id, country_code, manager_role, status, assigned_by)
    values
      (v_uid, v_inv.country_code, v_inv.invited_role, 'active', v_inv.invited_by)
    returning id into v_assignment_id;
  else
    update public.connect_manager_assignments
       set status = 'active', assigned_by = v_inv.invited_by, updated_at = now()
     where id = v_assignment_id;
  end if;

  insert into public.access_audit(actor_id, action, resource, resource_id, country_code, metadata)
  values (
    v_uid,
    'connect_manager_invitation_accepted',
    'connect_manager_invitations',
    v_inv.id::text,
    v_inv.country_code,
    jsonb_build_object('role', v_inv.invited_role, 'email', v_email, 'assignment_id', v_assignment_id)
  );

  return jsonb_build_object(
    'ok', true,
    'country_code', v_inv.country_code,
    'role', v_inv.invited_role,
    'assignment_id', v_assignment_id
  );
end;
$function$;
