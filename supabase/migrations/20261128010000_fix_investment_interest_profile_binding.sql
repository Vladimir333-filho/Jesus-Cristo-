-- P10: bind each investment-interest request to the exact investor profile
-- attached to the referenced opportunity. The previous predicate compared
-- o.investor_profile_id to itself, which was tautological.
-- Existing request data was checked before preparing this policy correction.
BEGIN;

DROP POLICY IF EXISTS investment_interest_insert
  ON public.investment_interest_requests;

CREATE POLICY investment_interest_insert
  ON public.investment_interest_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.investment_opportunities o
      JOIN public.investor_profiles p
        ON p.id = o.investor_profile_id
      WHERE o.id = investment_interest_requests.opportunity_id
        AND o.investor_profile_id = investment_interest_requests.investor_profile_id
        AND o.status = 'published'
        AND p.visibility = 'public'
        AND p.verification_status = 'verified'
        AND p.user_id <> (SELECT auth.uid())
    )
  );

COMMIT;
