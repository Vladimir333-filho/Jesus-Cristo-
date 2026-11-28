-- Rollback P10 only if the previous permissive predicate must be restored.
-- This restores the prior policy definition, including its tautological
-- investor-profile comparison. Do not use as a routine rollback.
BEGIN;

DROP POLICY IF EXISTS investment_interest_insert
  ON public.investment_interest_requests;

CREATE POLICY investment_interest_insert
  ON public.investment_interest_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.investment_opportunities o
      JOIN public.investor_profiles p
        ON p.id = o.investor_profile_id
      WHERE o.id = investment_interest_requests.opportunity_id
        AND o.investor_profile_id = o.investor_profile_id
        AND o.status = 'published'
        AND p.visibility = 'public'
        AND p.verification_status = 'verified'
        AND p.user_id <> auth.uid()
    )
  );

COMMIT;
