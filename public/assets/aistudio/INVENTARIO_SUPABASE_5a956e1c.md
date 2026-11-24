# Inventário Supabase confirmado

Project ID: `ydqekbhstwlbxhfkuplz`
URL: `https://ydqekbhstwlbxhfkuplz.supabase.co`
Motor: PostgreSQL / Supabase
Schema consultado: `public`
Tabelas públicas observadas: **43**
RLS: activa nas 43 tabelas do inventário.

## Tabelas
- `access_audit` — RLS activa na leitura do inventário.
- `business_catalog_items` — RLS activa na leitura do inventário.
- `business_connections` — RLS activa na leitura do inventário.
- `business_customer_interactions` — RLS activa na leitura do inventário.
- `business_customer_orders` — RLS activa na leitura do inventário.
- `business_customer_tasks` — RLS activa na leitura do inventário.
- `business_customers` — RLS activa na leitura do inventário.
- `business_documents` — RLS activa na leitura do inventário.
- `business_lead_interactions` — RLS activa na leitura do inventário.
- `business_opportunities` — RLS activa na leitura do inventário.
- `business_private` — RLS activa na leitura do inventário.
- `businesses` — RLS activa na leitura do inventário.
- `collaboration_applications` — RLS activa na leitura do inventário.
- `collaboration_opportunities` — RLS activa na leitura do inventário.
- `commissions` — RLS activa na leitura do inventário.
- `connect_manager_assignments` — RLS activa na leitura do inventário.
- `connect_manager_invitations` — RLS activa na leitura do inventário.
- `connection_requests` — RLS activa na leitura do inventário.
- `conversation_messages` — RLS activa na leitura do inventário.
- `conversations` — RLS activa na leitura do inventário.
- `countries` — RLS activa na leitura do inventário.
- `customer_service_requests` — RLS activa na leitura do inventário.
- `delegation_agenda` — RLS activa na leitura do inventário.
- `delegation_members` — RLS activa na leitura do inventário.
- `delegation_outcomes` — RLS activa na leitura do inventário.
- `event_registrations` — RLS activa na leitura do inventário.
- `events` — RLS activa na leitura do inventário.
- `investment_interest_requests` — RLS activa na leitura do inventário.
- `investment_opportunities` — RLS activa na leitura do inventário.
- `investor_profiles` — RLS activa na leitura do inventário.
- `investor_sector_interests` — RLS activa na leitura do inventário.
- `itineraries` — RLS activa na leitura do inventário.
- `itinerary_businesses` — RLS activa na leitura do inventário.
- `leads` — RLS activa na leitura do inventário.
- `notifications` — RLS activa na leitura do inventário.
- `opportunity_participants` — RLS activa na leitura do inventário.
- `payments` — RLS activa na leitura do inventário.
- `profile_views` — RLS activa na leitura do inventário.
- `profiles` — RLS activa na leitura do inventário.
- `reviews` — RLS activa na leitura do inventário.
- `talent_profiles` — RLS activa na leitura do inventário.
- `talent_skills` — RLS activa na leitura do inventário.
- `trade_delegations` — RLS activa na leitura do inventário.

## Migrações registadas
- `20261107032007` — `angola_connect_commercial_core_v1`
- `20261107032028` — `angola_connect_security_hardening_v1`
- `20261107032218` — `angola_connect_rls_privilege_hardening_v1`
- `20261108060129` — `angola_connect_private_business_documents_storage`
- `20261108070340` — `secure_business_documents_storage_policies`
- `20261108230916` — `restrict_business_document_table_admin_access`
- `20261110040424` — `business_catalog_items_v1`
- `20261110041116` — `business_lead_crm_interactions_v1`
- `20261110041127` — `business_lead_interactions_append_only`
- `20261110042407` — `add_business_pilot_dates`
- `20261110232507` — `create_business_customers_with_owner_rls`
- `20261110232716` — `restrict_business_customers_to_authenticated`
- `20261110234023` — `customer_relationship_and_retention`
- `20261110234157` — `customer_relationship_foreign_key_indexes`
- `20261111003057` — `customer_account_role_and_signup`
- `20261111003219` — `secure_customer_profile_role_updates`
- `20261112033214` — `customer_service_requests_mvp`
- `20261112033422` — `customer_requests_security_and_fk_index`
- `20261112033449` — `customer_requests_contact_snapshot_and_policy_fix`
- `20261112043309` — `activity_notifications_and_audit_events`
- `20261113000909` — `customer_business_messaging_mvp`
- `20261113000946` — `conversation_customer_name_snapshot`
- `20261113001158` — `messaging_column_permissions_hardening`
- `20261118155631` — `enforce_verified_business_interactions`
- `20261118212537` — `add_african_country_registry`
- `20261118213152` — `add_country_manager_access_foundation`
- `20261119092855` — `harden_platform_admin_function_search_path`
- `20261120090014` — `conversation_message_notifications_and_sender_index`
- `20261120090035` — `restrict_conversation_notification_trigger_execute`
- `20261120090118` — `remove_duplicate_conversation_notification_trigger`
- `20261121185445` — `africa_business_connections_and_opportunities`
- `20261121185506` — `africa_connection_workflow_guards_and_audit`
- `20261121185523` — `allow_applications_to_shared_opportunities`
- `20261121185535` — `connection_request_pair_integrity`
- `20261121185714` — `fix_connection_audit_trigger_record_handling`
- `20261121185900` — `fix_opportunity_participant_rls_business_scope`
- `20261121232452` — `connect_africa_four_modules_schema`
- `20261121232515` — `connect_africa_permissions_and_audit`
- `20261121232535` — `connect_africa_updated_at_triggers`
- `20261121232806` — `investment_interest_workflow_security`
- `20261121232818` — `investor_profile_verification_guard`
- `20261121233031` — `investor_workflow_immutability_guards`

## Segurança e regras observadas
- RLS activa em todas as tabelas públicas listadas.
- Políticas distinguem `anon` e `authenticated`, proprietário da empresa, administrador da plataforma e âmbito nacional.
- Empresas públicas: `status = 'approved'` e `verification_status = 'verified'`.
- Catálogo público depende também da empresa estar aprovada/verificada e item disponível.
- Documentos privados em bucket `business-documents`; acesso por URLs assinadas.
- `access_audit` é append-only e recebe eventos sensíveis via triggers/funções.
- Funções de plataforma incluem `is_platform_admin()` e `is_platform_admin_only()`; não simplificar ou substituir sem revisão de todas as políticas.
- Gestores nacionais têm acesso limitado a países atribuídos e activos.
- O esquema contém triggers de auditoria, integridade, actualização de timestamps e guardas de transição de estado.

## Importante
Este inventário é real, obtido do projecto Supabase, mas não equivale a um dump SQL integral. Para reconstrução exacta, obter colunas, tipos, defaults, constraints, índices, políticas, funções, triggers, buckets e permissões com o script `exportar_schema_exacto.sql`. Não importar dados de utilizadores para um projecto novo sem base legal e autorização.
