# Angola Connect Africa Business — Exportação do schema Supabase

## Resumo do resultado recebido

- Tabelas: 43
- Índices: 128
- Políticas RLS: 129
- Triggers: 127
- Funções: 26
- Chaves estrangeiras: 74

Este pacote contém o JSON integral produzido pela consulta e o CSV original enviado.
O resultado descreve a estrutura técnica; não é uma cópia dos registos de utilizadores,
empresas, pagamentos ou outros dados operacionais.

## Tabelas encontradas

- `access_audit` — 8 colunas
- `business_catalog_items` — 15 colunas
- `business_connections` — 7 colunas
- `business_customer_interactions` — 9 colunas
- `business_customer_orders` — 14 colunas
- `business_customer_tasks` — 13 colunas
- `business_customers` — 14 colunas
- `business_documents` — 8 colunas
- `business_lead_interactions` — 9 colunas
- `business_opportunities` — 17 colunas
- `business_private` — 5 colunas
- `businesses` — 30 colunas
- `collaboration_applications` — 7 colunas
- `collaboration_opportunities` — 13 colunas
- `commissions` — 8 colunas
- `connect_manager_assignments` — 8 colunas
- `connect_manager_invitations` — 14 colunas
- `connection_requests` — 9 colunas
- `conversation_messages` — 6 colunas
- `conversations` — 9 colunas
- `countries` — 6 colunas
- `customer_service_requests` — 17 colunas
- `delegation_agenda` — 11 colunas
- `delegation_members` — 7 colunas
- `delegation_outcomes` — 11 colunas
- `event_registrations` — 9 colunas
- `events` — 16 colunas
- `investment_interest_requests` — 8 colunas
- `investment_opportunities` — 16 colunas
- `investor_profiles` — 16 colunas
- `investor_sector_interests` — 6 colunas
- `itineraries` — 10 colunas
- `itinerary_businesses` — 4 colunas
- `leads` — 14 colunas
- `notifications` — 12 colunas
- `opportunity_participants` — 9 colunas
- `payments` — 12 colunas
- `profile_views` — 5 colunas
- `profiles` — 8 colunas
- `reviews` — 7 colunas
- `talent_profiles` — 15 colunas
- `talent_skills` — 6 colunas
- `trade_delegations` — 12 colunas

## Funções encontradas

- `accept_connect_manager_invitation`
- `audit_business_connection_events`
- `audit_connect_africa_change`
- `audit_connect_manager_assignment`
- `audit_connect_manager_invitation`
- `can_manage_connect_country`
- `enforce_connection_request_transition`
- `guard_business_opportunity_update`
- `guard_investment_interest_workflow`
- `guard_investment_opportunity_workflow`
- `guard_investor_profile_verification`
- `guard_new_connection_request`
- `guard_opportunity_participant_transition`
- `handle_new_user`
- `is_platform_admin`
- `is_platform_admin_only`
- `log_business_lead_status_change`
- `notify_connection_request_created`
- `notify_opportunity_participant`
- `notify_opportunity_participant_status`
- `prevent_profile_role_self_change`
- `set_business_catalog_item_updated_at`
- `set_connect_africa_updated_at`
- `set_customer_service_request_updated_at`
- `set_updated_at`
- `sync_business_connection_after_accept`

## Utilização

Anexar `schema_supabase_completo.json` ao projecto no Google AI Studio juntamente
com o pacote de reconstrução anterior. Não executar alterações na base de dados
de produção com base neste ficheiro sem revisão e autorização explícitas.
