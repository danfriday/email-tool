-- Supabase schema for storing flyer image metadata
create table if not exists flyer_images (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  url text not null,
  created_at timestamptz not null default now()
);

-- Example insert for a flyer image record
insert into flyer_images (name, url)
values ('praise-party-flyer', 'https://qwdgfsbzxsaefmvgcrsl.supabase.co/storage/v1/object/public/flier/IMG-20260428-WA0160.jpg');

-- Query to fetch the latest flyer image
select
  id,
  name,
  url,
  created_at
from flyer_images
order by created_at desc
limit 1;
