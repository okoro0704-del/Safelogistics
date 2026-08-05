-- Run in Supabase SQL Editor to enable /t/{slug} tenant preview.

CREATE OR REPLACE FUNCTION public.resolve_tenant_by_slug(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug TEXT;
  v_company public.companies;
BEGIN
  v_slug := lower(trim(COALESCE(p_slug, '')));
  IF v_slug = '' OR v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_company
  FROM public.companies
  WHERE slug = v_slug
    AND status = 'active';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'company_id', v_company.id,
    'company_name', v_company.name,
    'company_slug', v_company.slug,
    'company_status', v_company.status,
    'domain_id', NULL,
    'domain', 't/' || v_company.slug,
    'is_primary', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_tenant_by_slug(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_by_slug(TEXT) TO anon, authenticated;
