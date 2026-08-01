-- =============================================================================
-- Companies and profiles
-- =============================================================================

CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  logo_url TEXT,
  primary_color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT companies_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT companies_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX companies_slug_key ON public.companies (slug);

CREATE TRIGGER companies_set_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Profiles are 1:1 with auth.users. Role/company_id must not be client-writable.
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies (id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role public.user_role NOT NULL DEFAULT 'customer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT profiles_full_name_not_blank CHECK (length(trim(full_name)) > 0),
  CONSTRAINT profiles_email_not_blank CHECK (length(trim(email)) > 0),
  -- Company-scoped roles must belong to a company; master_admin may be global
  CONSTRAINT profiles_company_required_for_tenant_roles CHECK (
    (role = 'master_admin' AND company_id IS NULL)
    OR (role IN ('admin', 'customer') AND company_id IS NOT NULL)
  )
);

CREATE INDEX profiles_company_id_idx ON public.profiles (company_id);
CREATE INDEX profiles_role_idx ON public.profiles (role);
CREATE INDEX profiles_email_idx ON public.profiles (email);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Block clients from changing privileged profile fields
CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Changing profile role is not allowed';
    END IF;
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'Changing profile company_id is not allowed';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Changing profile id is not allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_protect_security_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_security_fields();
