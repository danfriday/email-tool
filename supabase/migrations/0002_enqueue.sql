-- =====================================================================
--  Recipient enqueue RPCs
--  These build the email_jobs queue with set-based INSERT ... SELECT so
--  even "all contacts" (100k+) is one fast statement, not N round-trips.
--  Suppressed contacts are excluded. ON CONFLICT keeps enqueue idempotent.
-- =====================================================================

create or replace function enqueue_contacts(p_campaign_id uuid, p_contact_ids uuid[])
returns int language plpgsql as $$
declare n int;
begin
  with ins as (
    insert into email_jobs (campaign_id, contact_id, email, name)
    select p_campaign_id, c.id, c.email, c.name
      from contacts c
     where c.id = any(p_contact_ids)
       and c.suppressed = false
    on conflict (campaign_id, contact_id) do nothing
    returning 1
  )
  select count(*) into n from ins;
  return coalesce(n, 0);
end;
$$;

create or replace function enqueue_lists(p_campaign_id uuid, p_list_ids uuid[])
returns int language plpgsql as $$
declare n int;
begin
  with ins as (
    insert into email_jobs (campaign_id, contact_id, email, name)
    select distinct on (c.id) p_campaign_id, c.id, c.email, c.name
      from contacts c
      join contact_list_members m on m.contact_id = c.id
     where m.list_id = any(p_list_ids)
       and c.suppressed = false
    on conflict (campaign_id, contact_id) do nothing
    returning 1
  )
  select count(*) into n from ins;
  return coalesce(n, 0);
end;
$$;

create or replace function enqueue_all(p_campaign_id uuid)
returns int language plpgsql as $$
declare n int;
begin
  with ins as (
    insert into email_jobs (campaign_id, contact_id, email, name)
    select p_campaign_id, c.id, c.email, c.name
      from contacts c
     where c.suppressed = false
    on conflict (campaign_id, contact_id) do nothing
    returning 1
  )
  select count(*) into n from ins;
  return coalesce(n, 0);
end;
$$;
