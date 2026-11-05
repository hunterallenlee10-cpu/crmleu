-- Venture co-leads. Each venture keeps one lead (ventures.lead_id) and can
-- now have up to two co-leads as well. Admins tick them off in the venture's
-- form, or drag a "<venture> Co-Lead" promotion onto someone on the Team
-- chart. The map, the chart and the list of promotions up for grabs all read
-- from here, so they always agree.
--
-- Rules enforced here (not just in the UI):
--   * Everyone on the team can see who co-leads what.
--   * Only admins add or remove co-leads.
--   * A venture has at most two co-leads, and its lead can't also be one of
--     them. Making a co-lead the lead takes them off the co-lead list.
--   * Removing a venture (or a person) removes their co-lead rows.

create table public.venture_co_leads (
  venture_id uuid not null references public.ventures (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (venture_id, user_id)
);

create index venture_co_leads_user_idx on public.venture_co_leads (user_id);

create function public.venture_co_leads_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lead uuid;
begin
  -- Lock the venture so two saves at once can't squeeze in a third co-lead.
  select lead_id into v_lead from public.ventures where id = new.venture_id for update;
  if v_lead = new.user_id then
    raise exception 'They already lead this venture.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.venture_co_leads
      where venture_id = new.venture_id and user_id <> new.user_id) >= 2 then
    raise exception 'A venture can have up to 2 co-leads.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger venture_co_leads_before_write
  before insert or update on public.venture_co_leads
  for each row execute function public.venture_co_leads_before_write();

-- A co-lead who becomes the lead stops being a co-lead.
create function public.ventures_after_lead_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.venture_co_leads where venture_id = new.id and user_id = new.lead_id;
  return null;
end;
$$;

create trigger ventures_after_lead_change
  after update of lead_id on public.ventures
  for each row when (new.lead_id is not null and new.lead_id is distinct from old.lead_id)
  execute function public.ventures_after_lead_change();

-- Replace a venture's co-leads in one go (the venture form saves this way).
-- Runs as the caller, so RLS still means only admins can change anything.
create function public.set_venture_co_leads(p_venture uuid, p_people uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.venture_co_leads
  where venture_id = p_venture and not (user_id = any (coalesce(p_people, '{}')));

  insert into public.venture_co_leads (venture_id, user_id)
  select p_venture, person from unnest(coalesce(p_people, '{}')) as person
  on conflict do nothing;
end;
$$;

-------------------------------------------------------------------------------
-- Row-level security
-------------------------------------------------------------------------------

alter table public.venture_co_leads enable row level security;

create policy "venture_co_leads: read for the team"
  on public.venture_co_leads for select to authenticated
  using ((select public.is_active_user()));

create policy "venture_co_leads: admin insert"
  on public.venture_co_leads for insert to authenticated
  with check ((select public.is_admin()));

create policy "venture_co_leads: admin delete"
  on public.venture_co_leads for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.venture_co_leads from anon;
revoke execute on function public.venture_co_leads_before_write() from public, anon;
revoke execute on function public.ventures_after_lead_change() from public, anon;
revoke execute on function public.set_venture_co_leads(uuid, uuid[]) from public, anon;
grant execute on function public.set_venture_co_leads(uuid, uuid[]) to authenticated;

-------------------------------------------------------------------------------
-- Line up the map with titles people already have
-------------------------------------------------------------------------------
-- Someone titled "Websites Lead" becomes the Websites lead on the map, if it
-- has no lead yet. Someone titled "Websites Co-Lead" (or Co-lead, Colead,
-- Co Lead) becomes a co-lead, up to two per venture. Only active people, and
-- only exact matches (ignoring case).

update public.ventures v
set lead_id = m.person
from (
  select distinct on (v2.id) v2.id as venture_id, p.id as person
  from public.ventures v2
  join public.profiles p on p.active and lower(p.title) = lower(v2.name || ' Lead')
  where v2.lead_id is null
  order by v2.id, p.created_at, p.id
) m
where v.id = m.venture_id;

insert into public.venture_co_leads (venture_id, user_id)
select venture_id, person
from (
  select v.id as venture_id, p.id as person,
         row_number() over (partition by v.id order by p.created_at, p.id) as n
  from public.ventures v
  join public.profiles p
    on p.active
   and lower(p.title) in (lower(v.name || ' Co-Lead'), lower(v.name || ' Colead'), lower(v.name || ' Co Lead'))
  where p.id is distinct from v.lead_id
) m
where n <= 2;
