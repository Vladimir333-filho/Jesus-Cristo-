-- CONSULTA DE INVENTÁRIO READ-ONLY PARA O SUPABASE SQL EDITOR
-- Não altera tabelas nem dados. Exporta metadados do schema public.
-- Copie o resultado JSON e guarde-o como schema-exacto.json.

select jsonb_pretty(jsonb_build_object(
  'tables', (
    select jsonb_agg(jsonb_build_object(
      'table', t.table_name,
      'columns', (
        select jsonb_agg(jsonb_build_object(
          'name', c.column_name, 'type', c.data_type,
          'udt', c.udt_name, 'nullable', c.is_nullable,
          'default', c.column_default, 'max_length', c.character_maximum_length
        ) order by c.ordinal_position)
        from information_schema.columns c
        where c.table_schema=t.table_schema and c.table_name=t.table_name
      ),
      'primary_keys', (
        select jsonb_agg(kcu.column_name order by kcu.ordinal_position)
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on tc.constraint_name=kcu.constraint_name
         and tc.table_schema=kcu.table_schema
        where tc.table_schema=t.table_schema and tc.table_name=t.table_name
          and tc.constraint_type='PRIMARY KEY'
      ),
      'rls_enabled', (
        select c.relrowsecurity
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname=t.table_schema and c.relname=t.table_name
      )
    ) order by t.table_name)
    from information_schema.tables t
    where t.table_schema='public' and t.table_type='BASE TABLE'
  ),
  'foreign_keys', (
    select jsonb_agg(jsonb_build_object(
      'table', tc.table_name, 'constraint', tc.constraint_name,
      'column', kcu.column_name, 'references_table', ccu.table_name,
      'references_column', ccu.column_name
    ) order by tc.table_name, tc.constraint_name)
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name=kcu.constraint_name and tc.table_schema=kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.constraint_schema
    where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'
  ),
  'policies', (
    select jsonb_agg(jsonb_build_object(
      'table', tablename, 'name', policyname, 'command', cmd,
      'roles', roles, 'using', qual, 'with_check', with_check
    ) order by tablename, policyname)
    from pg_policies where schemaname='public'
  ),
  'functions', (
    select jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'arguments', pg_get_function_identity_arguments(p.oid),
      'security_definer', p.prosecdef,
      'definition', pg_get_functiondef(p.oid)
    ) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
  ),
  'triggers', (
    select jsonb_agg(jsonb_build_object(
      'table', event_object_table, 'name', trigger_name,
      'event', event_manipulation, 'action', action_statement
    ) order by event_object_table, trigger_name)
    from information_schema.triggers where trigger_schema='public'
  ),
  'indexes', (
    select jsonb_agg(jsonb_build_object(
      'table', tablename, 'index', indexname, 'definition', indexdef
    ) order by tablename, indexname)
    from pg_indexes where schemaname='public'
  )
));
