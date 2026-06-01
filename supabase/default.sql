-- Supabase default SQL schema for the contacts table
-- Run this in your Supabase SQL editor or migration file.

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists contacts_created_at_idx on contacts (created_at desc);

-- Default query to fetch contacts ordered by creation time
select
  id,
  name,
  email,
  status,
  created_at,
  sent_at
from contacts
order by created_at desc;
