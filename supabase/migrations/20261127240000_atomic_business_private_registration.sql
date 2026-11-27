-- P06: make business + private legal data writes atomic.
-- SECURITY INVOKER preserves the caller's RLS and table privileges.
BEGIN;

CREATE OR REPLACE FUNCTION public.register_business_with_private(p_business jsonb, p_private jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_business public.businesses%ROWTYPE;
  v_private public.business_private%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_business) <> 'object' OR jsonb_typeof(p_private) <> 'object' THEN
    RAISE EXCEPTION 'Invalid registration payload' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.businesses (
    owner_id, name, slug, country_code, province, municipality, address,
    category, subcategory, description, description_en, whatsapp, phone,
    email, website, services, languages
  ) VALUES (
    v_user_id,
    nullif(btrim(p_business->>'name'), ''),
    nullif(btrim(p_business->>'slug'), ''),
    coalesce(nullif(btrim(p_business->>'country_code'), ''), 'AO'),
    nullif(btrim(p_business->>'province'), ''),
    nullif(btrim(p_business->>'municipality'), ''),
    nullif(btrim(p_business->>'address'), ''),
    nullif(btrim(p_business->>'category'), ''),
    nullif(btrim(p_business->>'subcategory'), ''),
    coalesce(p_business->>'description', ''),
    nullif(btrim(p_business->>'description_en'), ''),
    nullif(btrim(p_business->>'whatsapp'), ''),
    nullif(btrim(p_business->>'phone'), ''),
    nullif(btrim(p_business->>'email'), ''),
    nullif(btrim(p_business->>'website'), ''),
    coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(p_business->'services','[]'::jsonb))), ARRAY[]::text[]),
    coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(p_business->'languages','["pt"]'::jsonb))), ARRAY['pt']::text[])
  )
  RETURNING * INTO v_business;

  INSERT INTO public.business_private (business_id, nif, license_number, owner_notes, updated_at)
  VALUES (
    v_business.id,
    nullif(btrim(p_private->>'nif'), ''),
    nullif(btrim(p_private->>'license_number'), ''),
    nullif(btrim(p_private->>'owner_notes'), ''),
    now()
  )
  RETURNING * INTO v_private;

  RETURN jsonb_build_object('business', to_jsonb(v_business), 'privateData', to_jsonb(v_private));
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_pending_business_with_private(
  p_business_id uuid, p_business jsonb, p_private jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_business public.businesses%ROWTYPE;
  v_private public.business_private%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_business_id IS NULL OR jsonb_typeof(p_business) <> 'object'
     OR jsonb_typeof(p_private) <> 'object' THEN
    RAISE EXCEPTION 'Invalid registration payload' USING ERRCODE = '22023';
  END IF;

  UPDATE public.businesses
  SET name = nullif(btrim(p_business->>'name'), ''),
      country_code = coalesce(nullif(btrim(p_business->>'country_code'), ''), country_code),
      province = nullif(btrim(p_business->>'province'), ''),
      municipality = nullif(btrim(p_business->>'municipality'), ''),
      address = nullif(btrim(p_business->>'address'), ''),
      category = nullif(btrim(p_business->>'category'), ''),
      subcategory = nullif(btrim(p_business->>'subcategory'), ''),
      description = coalesce(p_business->>'description', ''),
      description_en = nullif(btrim(p_business->>'description_en'), ''),
      whatsapp = nullif(btrim(p_business->>'whatsapp'), ''),
      phone = nullif(btrim(p_business->>'phone'), ''),
      email = nullif(btrim(p_business->>'email'), ''),
      website = nullif(btrim(p_business->>'website'), ''),
      services = coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(p_business->'services','[]'::jsonb))), ARRAY[]::text[]),
      languages = coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(p_business->'languages','["pt"]'::jsonb))), ARRAY['pt']::text[])
  WHERE id = p_business_id
    AND owner_id = v_user_id
    AND status = 'pending'
    AND verification_status = 'unverified'
  RETURNING * INTO v_business;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business not found or not editable in its current state'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.business_private (business_id, nif, license_number, owner_notes, updated_at)
  VALUES (
    v_business.id,
    nullif(btrim(p_private->>'nif'), ''),
    nullif(btrim(p_private->>'license_number'), ''),
    nullif(btrim(p_private->>'owner_notes'), ''),
    now()
  )
  ON CONFLICT (business_id) DO UPDATE
  SET nif = EXCLUDED.nif,
      license_number = EXCLUDED.license_number,
      owner_notes = EXCLUDED.owner_notes,
      updated_at = now()
  RETURNING * INTO v_private;

  RETURN jsonb_build_object('business', to_jsonb(v_business), 'privateData', to_jsonb(v_private));
END;
$function$;

REVOKE ALL ON FUNCTION public.register_business_with_private(jsonb,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_pending_business_with_private(uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_business_with_private(jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_pending_business_with_private(uuid,jsonb,jsonb) TO authenticated;

COMMIT;
