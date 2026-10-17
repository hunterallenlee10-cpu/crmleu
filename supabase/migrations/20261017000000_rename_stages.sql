-- New pipeline stages:
--   New, Contacted, Warm Up Program, Call Booked, Quote Given, Won, Lost
--
-- "Spec Sent" becomes "Warm Up Program" and "Proposal Sent" becomes "Quote
-- Given". Renaming the enum values moves every lead and every past stage
-- change across with them. The leaderboard's "specs sent" count becomes
-- "warm ups". Old activity text ("Contacted → Spec Sent") is history and is
-- left as written.

alter type public.lead_stage rename value 'spec_sent' to 'warm_up_program';
alter type public.lead_stage rename value 'proposal_sent' to 'quote_given';

create or replace function public.stage_label(s public.lead_stage)
returns text
language sql
immutable
set search_path = ''
as $$
  select case s
    when 'new' then 'New'
    when 'contacted' then 'Contacted'
    when 'warm_up_program' then 'Warm Up Program'
    when 'call_booked' then 'Call Booked'
    when 'quote_given' then 'Quote Given'
    when 'won' then 'Won'
    when 'lost' then 'Lost'
  end
$$;

-------------------------------------------------------------------------------
-- Leaderboard: same rules as 20261014000000_leaderboard_reps_only.sql, with
-- specs_sent renamed to warm_ups (leads moved to Warm Up Program). The return
-- columns change, so the function is dropped and created again.
-------------------------------------------------------------------------------

drop function public.team_leaderboard(text);

create function public.team_leaderboard(p_period text default 'week')
returns table (
  user_id      uuid,
  full_name    text,
  outreach     bigint,
  warm_ups     bigint,
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
           count(distinct l.id) filter (where a.to_stage = 'warm_up_program') as warm_ups,
           count(distinct l.id) filter (where a.to_stage = 'call_booked') as booked
    from public.activities a
    join public.leads l on l.id = a.lead_id
    where a.created_at >= v_start
      and a.type = 'stage_change'
      and a.to_stage in ('warm_up_program', 'call_booked')
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
         coalesce(m.warm_ups, 0),
         coalesce(m.booked, 0),
         coalesce(w.deals, 0),
         coalesce(w.total, 0)
  from public.profiles p
  left join touches t on t.id = p.id
  left join moves m on m.id = p.id
  left join wins w on w.id = p.id
  where p.role = 'rep'
    and (p.active or t.id is not null or m.id is not null or w.id is not null)
  order by p.full_name;
end;
$$;

revoke execute on function public.team_leaderboard(text) from public, anon;
grant execute on function public.team_leaderboard(text) to authenticated, service_role;
