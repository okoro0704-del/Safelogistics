-- =============================================================================
-- Automatic DNS provisioning & domain lifecycle (Prompt 12)
-- Billing / domain purchasing / automatic registration are NOT implemented.
-- =============================================================================

-- Extend lifecycle enum
ALTER TYPE public.company_domain_status ADD VALUE IF NOT EXISTS 'provisioning';
ALTER TYPE public.company_domain_status ADD VALUE IF NOT EXISTS 'verifying';
ALTER TYPE public.company_domain_status ADD VALUE IF NOT EXISTS 'failed';

-- Allow disabled domains to free the hostname for reclaim (fresh verification required)
DROP INDEX IF EXISTS public.company_domains_normalized_domain_key;
CREATE UNIQUE INDEX company_domains_normalized_domain_live_key
  ON public.company_domains (normalized_domain)
  WHERE status <> 'disabled';

ALTER TABLE public.company_domains
  ADD COLUMN IF NOT EXISTS dns_provider TEXT,
  ADD COLUMN IF NOT EXISTS hosting_provider TEXT,
  ADD COLUMN IF NOT EXISTS dns_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS hosting_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ssl_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dns_target_record_id TEXT,
  ADD COLUMN IF NOT EXISTS dns_txt_record_id TEXT,
  ADD COLUMN IF NOT EXISTS hosting_domain_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_zone_id TEXT;

ALTER TABLE public.company_domains
  DROP CONSTRAINT IF EXISTS company_domains_dns_status_check;
ALTER TABLE public.company_domains
  ADD CONSTRAINT company_domains_dns_status_check
  CHECK (dns_status IN ('pending', 'configured', 'failed', 'manual'));

ALTER TABLE public.company_domains
  DROP CONSTRAINT IF EXISTS company_domains_hosting_status_check;
ALTER TABLE public.company_domains
  ADD CONSTRAINT company_domains_hosting_status_check
  CHECK (hosting_status IN ('pending', 'configured', 'failed', 'ready', 'manual'));

ALTER TABLE public.company_domains
  DROP CONSTRAINT IF EXISTS company_domains_ssl_status_check;
ALTER TABLE public.company_domains
  ADD CONSTRAINT company_domains_ssl_status_check
  CHECK (ssl_status IN ('pending', 'provisioning', 'ready', 'failed', 'unknown'));

-- Update status transition helpers
CREATE OR REPLACE FUNCTION public.master_set_domain_lifecycle(
  p_domain_id UUID,
  p_status public.company_domain_status,
  p_dns_status TEXT DEFAULT NULL,
  p_hosting_status TEXT DEFAULT NULL,
  p_ssl_status TEXT DEFAULT NULL,
  p_last_error TEXT DEFAULT NULL,
  p_dns_target_record_id TEXT DEFAULT NULL,
  p_dns_txt_record_id TEXT DEFAULT NULL,
  p_hosting_domain_id TEXT DEFAULT NULL,
  p_provider_zone_id TEXT DEFAULT NULL,
  p_dns_provider TEXT DEFAULT NULL,
  p_hosting_provider TEXT DEFAULT NULL,
  p_clear_error BOOLEAN DEFAULT FALSE
)
RETURNS public.company_domains
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.company_domains;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can update domain lifecycle';
  END IF;

  SELECT * INTO v_row FROM public.company_domains WHERE id = p_domain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Domain not found';
  END IF;

  IF p_status = 'active' AND v_row.verified_at IS NULL THEN
    RAISE EXCEPTION 'Domain must be verified before it can be activated';
  END IF;

  UPDATE public.company_domains
  SET
    status = p_status,
    dns_status = COALESCE(p_dns_status, dns_status),
    hosting_status = COALESCE(p_hosting_status, hosting_status),
    ssl_status = COALESCE(p_ssl_status, ssl_status),
    last_error = CASE
      WHEN p_clear_error THEN NULL
      WHEN p_last_error IS NOT NULL THEN p_last_error
      ELSE last_error
    END,
    dns_target_record_id = COALESCE(p_dns_target_record_id, dns_target_record_id),
    dns_txt_record_id = COALESCE(p_dns_txt_record_id, dns_txt_record_id),
    hosting_domain_id = COALESCE(p_hosting_domain_id, hosting_domain_id),
    provider_zone_id = COALESCE(p_provider_zone_id, provider_zone_id),
    dns_provider = COALESCE(p_dns_provider, dns_provider),
    hosting_provider = COALESCE(p_hosting_provider, hosting_provider),
    last_checked_at = timezone('utc', now()),
    activated_at = CASE
      WHEN p_status = 'active' THEN COALESCE(activated_at, timezone('utc', now()))
      WHEN p_status = 'disabled' THEN activated_at
      ELSE activated_at
    END,
    is_primary = CASE
      WHEN p_status = 'disabled' THEN FALSE
      ELSE is_primary
    END,
    verified_at = CASE
      -- Reclaim path: disabled domains lose verification so another tenant
      -- (or re-add) must verify ownership again.
      WHEN p_status = 'disabled' THEN NULL
      ELSE verified_at
    END
  WHERE id = p_domain_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Re-enable without re-verification only if verified_at is still set.
-- After disable we clear verified_at → must re-verify.
CREATE OR REPLACE FUNCTION public.master_set_domain_status(
  p_domain_id UUID,
  p_status public.company_domain_status
)
RETURNS public.company_domains
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.company_domains;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can change domain status';
  END IF;

  IF p_status NOT IN ('active', 'disabled', 'pending', 'verifying', 'failed') THEN
    RAISE EXCEPTION 'Invalid domain status transition';
  END IF;

  SELECT * INTO v_row FROM public.company_domains WHERE id = p_domain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Domain not found';
  END IF;

  IF p_status = 'active' AND v_row.verified_at IS NULL THEN
    RAISE EXCEPTION 'Domain must be verified before it can be activated';
  END IF;

  -- Reclaim uniqueness: cannot activate if another live domain owns hostname
  IF p_status = 'active' AND EXISTS (
    SELECT 1 FROM public.company_domains d
    WHERE d.normalized_domain = v_row.normalized_domain
      AND d.id <> p_domain_id
      AND d.status <> 'disabled'
  ) THEN
    RAISE EXCEPTION 'Domain already registered';
  END IF;

  UPDATE public.company_domains
  SET
    status = p_status,
    is_primary = CASE WHEN p_status = 'disabled' THEN FALSE ELSE is_primary END,
    verified_at = CASE WHEN p_status = 'disabled' THEN NULL ELSE verified_at END,
    activated_at = CASE
      WHEN p_status = 'active' THEN COALESCE(activated_at, timezone('utc', now()))
      ELSE activated_at
    END,
    last_checked_at = timezone('utc', now()),
    last_error = CASE WHEN p_status = 'active' THEN NULL ELSE last_error END
  WHERE id = p_domain_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_mark_domain_verified(p_domain_id UUID)
RETURNS public.company_domains
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.company_domains;
  v_make_primary BOOLEAN;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can verify domains';
  END IF;

  SELECT * INTO v_row FROM public.company_domains WHERE id = p_domain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Domain not found';
  END IF;

  IF v_row.status = 'disabled' THEN
    RAISE EXCEPTION 'Disabled domains cannot be verified';
  END IF;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.company_domains
    WHERE company_id = v_row.company_id
      AND is_primary
      AND id <> p_domain_id
      AND status = 'active'
  )
  INTO v_make_primary;

  UPDATE public.company_domains
  SET
    status = 'active',
    verified_at = COALESCE(verified_at, timezone('utc', now())),
    activated_at = COALESCE(activated_at, timezone('utc', now())),
    last_verification_attempt_at = timezone('utc', now()),
    last_checked_at = timezone('utc', now()),
    last_error = NULL,
    dns_status = CASE
      WHEN dns_status = 'failed' THEN 'configured'
      WHEN dns_status = 'pending' THEN 'configured'
      ELSE dns_status
    END,
    is_primary = CASE WHEN v_make_primary THEN TRUE ELSE is_primary END
  WHERE id = p_domain_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.master_set_domain_lifecycle(UUID, public.company_domain_status, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_set_domain_lifecycle(UUID, public.company_domain_status, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
