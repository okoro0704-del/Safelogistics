-- Backfill managed domains + mailbox addresses (idempotent).

-- Apex {slug}.webfinance.app
insert into public.company_domains (
  company_id, domain, normalized_domain, verification_token, status, is_primary, verified_at
)
select
  c.id,
  c.slug || '.webfinance.app',
  c.slug || '.webfinance.app',
  encode(gen_random_bytes(32), 'hex'),
  'active'::public.company_domain_status,
  false,
  now()
from public.companies c
where c.slug is not null
  and length(c.slug) > 1
  and not exists (
    select 1 from public.company_domains d
    where d.normalized_domain = c.slug || '.webfinance.app'
  );

-- Apps {slug}.apps.webfinance.app (primary)
insert into public.company_domains (
  company_id, domain, normalized_domain, verification_token, status, is_primary, verified_at
)
select
  c.id,
  c.slug || '.apps.webfinance.app',
  c.slug || '.apps.webfinance.app',
  encode(gen_random_bytes(32), 'hex'),
  'active'::public.company_domain_status,
  true,
  now()
from public.companies c
where c.slug is not null
  and length(c.slug) > 1
  and not exists (
    select 1 from public.company_domains d
    where d.normalized_domain = c.slug || '.apps.webfinance.app'
  );

-- Platform mailbox domain per company
insert into public.company_email_domains (
  company_id, domain, normalized_domain, status, last_error
)
select c.id, 'webfinance.app', 'webfinance.app', 'pending', null
from public.companies c
where c.slug is not null
  and length(c.slug) > 1
  and not exists (
    select 1 from public.company_email_domains e
    where e.company_id = c.id and e.normalized_domain = 'webfinance.app'
  );

-- Allocate info4{slug}@webfinance.app as default company mailbox
insert into public.company_mailboxes (
  company_id, email_domain_id, local_part, full_address, mailbox_type, is_default
)
select
  c.id,
  e.id,
  'info4' || lower(regexp_replace(c.slug, '[^a-z0-9-]', '', 'g')),
  'info4' || lower(regexp_replace(c.slug, '[^a-z0-9-]', '', 'g')) || '@webfinance.app',
  'app_inbox',
  true
from public.companies c
join public.company_email_domains e
  on e.company_id = c.id and e.normalized_domain = 'webfinance.app'
where c.slug is not null
  and length(c.slug) > 1
  and not exists (
    select 1 from public.company_mailboxes m
    where m.full_address =
      'info4' || lower(regexp_replace(c.slug, '[^a-z0-9-]', '', 'g')) || '@webfinance.app'
  );

-- Ensure allocated mailbox is the default
update public.company_mailboxes m
set is_default = true, updated_at = now()
from public.companies c
where m.company_id = c.id
  and m.full_address =
    'info4' || lower(regexp_replace(c.slug, '[^a-z0-9-]', '', 'g')) || '@webfinance.app';

update public.company_mailboxes m
set is_default = false, updated_at = now()
from public.companies c
where m.company_id = c.id
  and m.is_default = true
  and m.full_address <>
    'info4' || lower(regexp_replace(c.slug, '[^a-z0-9-]', '', 'g')) || '@webfinance.app';

select c.slug, m.full_address, d.normalized_domain
from public.companies c
left join public.company_mailboxes m on m.company_id = c.id and m.is_default
left join public.company_domains d on d.company_id = c.id and d.normalized_domain = c.slug || '.webfinance.app'
where c.slug = 'miamisecurity';
