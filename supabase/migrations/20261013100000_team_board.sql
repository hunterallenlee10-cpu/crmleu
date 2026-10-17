-- Team board on the Today page: what everyone did in the last 24 hours, and
-- leaderboards so reps can compete.
--
-- Reps still can't read each other's leads or activities. These functions are
-- security definer and hand back only counts, names and activity types for
-- other people's work; business names and links are included only for leads
-- the caller can already see (their own, or all of them for an admin).

-------------------------------------------------------------------------------
-- Record which stage a stage change moved a lead to, so it can be counted
-- without parsing the activity text.
-------------------------------------------------------------------------------

alter table public.activities
  add column to_stage public.lead_stage,
  add constraint to_stage_only_on_stage_change check (to_stage is null or type = 'stage_change');

create index activities_created_idx on public.activities (created_at desc);

-- Backfill from the "Old → New" text the trigger has been writing.
alter table public.activities disable trigger activities_block_update;
update public.activities a
set to_stage = s.value
from (values
  ('new'::public.lead_stage), ('contacted'), ('spec_sent'), ('call_booked'),
  ('proposal_sent'), ('won'), ('lost')
) as s (value)
where a.type = 'stage_change'
  and a.to_stage is null
  and split_part(a.body, ' → ', 2) like public.stage_label(s.value) || '%';
alter table public.activities enable trigger activities_block_update;

create or replace function public.leads_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from text;
  v_to   text;
begin
  if new.stage is distinct from old.stage then
    insert into public.activities (lead_id, user_id, type, body, to_stage)
    values (
      new.id,
      auth.uid(),
      'stage_change',
      public.stage_label(old.stage) || ' → ' || public.stage_label(new.stage)
        || case when new.stage = 'lost' then ' (reason: ' || new.lost_reason || ')' else '' end
        || case when new.stage = 'won' then ' ($' || new.deal_value::text || ')' else '' end,
      new.stage
    );
  end if;

  if new.owner_id is distinct from old.owner_id then
    select full_name into v_from from public.profiles where id = old.owner_id;
    select full_name into v_to from public.profiles where id = new.owner_id;
    insert into public.activities (lead_id, user_id, type, body)
    values (
      new.id,
      auth.uid(),
      'reassignment',
      'Reassigned from ' || coalesce(v_from, 'Unassigned') || ' to ' || coalesce(v_to, 'Unassigned')
    );
  end if;

  return new;
end;
$$;

-------------------------------------------------------------------------------
-- Everything people did in the last 24 hours, newest first.
-- Reassignments and system entries (API, import) are left out. lead_id and
-- business_name are null unless the caller can see that lead, and note text
-- is never returned.
-------------------------------------------------------------------------------

create function public.team_feed(p_limit integer default 500)
returns table (
  id            bigint,
  created_at    timestamptz,
  user_id       uuid,
  actor_name    text,
  type          public.activity_type,
  to_stage      public.lead_stage,
  deal_value    numeric,
  lead_id       uuid,
  business_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
begin
  if auth.uid() is not null and not public.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return query
  select a.id,
         a.created_at,
         a.user_id,
         p.full_name,
         a.type,
         a.to_stage,
         case when a.to_stage = 'won' and l.stage = 'won' then l.deal_value end,
         case when v_admin or l.owner_id = auth.uid() then l.id end,
         case when v_admin or l.owner_id = auth.uid() then l.business_name end
  from public.activities a
  join public.profiles p on p.id = a.user_id
  join public.leads l on l.id = a.lead_id
  where a.created_at >= now() - interval '24 hours'
    and a.type <> 'reassignment'
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end;
$$;

-------------------------------------------------------------------------------
-- Leaderboard for 'day', 'week' (starts Monday) or 'month', New York time.
--   outreach      calls, texts, emails and meetings the person logged
--   specs_sent    leads they own that moved to Spec Sent in the period
--   calls_booked  leads they own that moved to Call Booked in the period
--   deals_won / revenue  their wins with a won date in the period (the same
--                 rule as the admin dashboard and commission)
-- Returns every active rep, plus anyone else with a score.
-------------------------------------------------------------------------------

create function public.team_leaderboard(p_period text default 'week')
returns table (
  user_id      uuid,
  full_name    text,
  outreach     bigint,
  specs_sent   bigint,
  calls_booked bigint,
  deals_won    bigint,
  revenue      numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start_date date;
  v_start      timestamptz;
begin
  if auth.uid() is not null and not public.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_period is null or p_period not in ('day', 'week', 'month') then
    raise exception 'Unknown period: %', p_period using errcode = '22023';
  end if;

  v_start_date := date_trunc(p_period, public.today_ny())::date;
  v_start := v_start_date::timestamp at time zone 'America/New_York';

  return query
  with touches as (
    select a.user_id as id, count(*) as n
    from public.activities a
    where a.created_at >= v_start
      and a.user_id is not null
      and a.type in ('call', 'text', 'email', 'meeting')
    group by a.user_id
  ),
  moves as (
    select l.owner_id as id,
           count(distinct l.id) filter (where a.to_stage = 'spec_sent') as specs,
           count(distinct l.id) filter (where a.to_stage = 'call_booked') as booked
    from public.activities a
    join public.leads l on l.id = a.lead_id
    where a.created_at >= v_start
      and a.type = 'stage_change'
      and a.to_stage in ('spec_sent', 'call_booked')
      and l.owner_id is not null
    group by l.owner_id
  ),
  wins as (
    select l.owner_id as id, count(*) as deals, coalesce(sum(l.deal_value), 0) as total
    from public.leads l
    where l.stage = 'won'
      and l.owner_id is not null
      and l.won_date >= v_start_date
      and l.won_date <= public.today_ny()
    group by l.owner_id
  )
  select p.id,
         p.full_name,
         coalesce(t.n, 0),
         coalesce(m.specs, 0),
         coalesce(m.booked, 0),
         coalesce(w.deals, 0),
         coalesce(w.total, 0)
  from public.profiles p
  left join touches t on t.id = p.id
  left join moves m on m.id = p.id
  left join wins w on w.id = p.id
  where (p.active and p.role = 'rep')
     or t.id is not null or m.id is not null or w.id is not null
  order by p.full_name;
end;
$$;

revoke execute on function
  public.team_feed(integer),
  public.team_leaderboard(text)
from public, anon;

grant execute on function
  public.team_feed(integer),
  public.team_leaderboard(text)
to authenticated, service_role;
