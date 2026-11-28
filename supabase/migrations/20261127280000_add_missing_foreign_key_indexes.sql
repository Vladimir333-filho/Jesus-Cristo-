-- Add covering indexes for the 21 foreign keys identified by the Supabase advisor.
-- Indexes are additive: no table data, constraints, policies, or existing indexes are changed.
-- IF NOT EXISTS makes this safe to re-run if an equivalent named index was created separately.

CREATE INDEX IF NOT EXISTS business_opportunities_created_by_fk_idx
  ON public.business_opportunities (created_by);

CREATE INDEX IF NOT EXISTS collaboration_applications_talent_profile_id_fk_idx
  ON public.collaboration_applications (talent_profile_id);

CREATE INDEX IF NOT EXISTS collaboration_opportunities_business_id_fk_idx
  ON public.collaboration_opportunities (business_id);

CREATE INDEX IF NOT EXISTS collaboration_opportunities_created_by_fk_idx
  ON public.collaboration_opportunities (created_by);

CREATE INDEX IF NOT EXISTS connect_manager_assignments_assigned_by_fk_idx
  ON public.connect_manager_assignments (assigned_by);

CREATE INDEX IF NOT EXISTS connect_manager_invitations_accepted_by_fk_idx
  ON public.connect_manager_invitations (accepted_by);

CREATE INDEX IF NOT EXISTS connect_manager_invitations_invited_by_fk_idx
  ON public.connect_manager_invitations (invited_by);

CREATE INDEX IF NOT EXISTS connection_requests_requested_by_fk_idx
  ON public.connection_requests (requested_by);

CREATE INDEX IF NOT EXISTS delegation_agenda_responsible_user_id_fk_idx
  ON public.delegation_agenda (responsible_user_id);

CREATE INDEX IF NOT EXISTS delegation_members_user_id_fk_idx
  ON public.delegation_members (user_id);

CREATE INDEX IF NOT EXISTS delegation_outcomes_recorded_by_fk_idx
  ON public.delegation_outcomes (recorded_by);

CREATE INDEX IF NOT EXISTS event_registrations_user_id_fk_idx
  ON public.event_registrations (user_id);

CREATE INDEX IF NOT EXISTS events_created_by_fk_idx
  ON public.events (created_by);

CREATE INDEX IF NOT EXISTS investment_interest_requests_opportunity_investor_fk_idx
  ON public.investment_interest_requests (opportunity_id, investor_profile_id);

CREATE INDEX IF NOT EXISTS investment_opportunities_created_by_fk_idx
  ON public.investment_opportunities (created_by);

CREATE INDEX IF NOT EXISTS investment_opportunities_investor_profile_id_fk_idx
  ON public.investment_opportunities (investor_profile_id);

CREATE INDEX IF NOT EXISTS itineraries_created_by_fk_idx
  ON public.itineraries (created_by);

CREATE INDEX IF NOT EXISTS itinerary_businesses_business_id_fk_idx
  ON public.itinerary_businesses (business_id);

CREATE INDEX IF NOT EXISTS opportunity_participants_requested_by_fk_idx
  ON public.opportunity_participants (requested_by);

CREATE INDEX IF NOT EXISTS trade_delegations_created_by_fk_idx
  ON public.trade_delegations (created_by);

CREATE INDEX IF NOT EXISTS trade_delegations_destination_country_code_fk_idx
  ON public.trade_delegations (destination_country_code);
