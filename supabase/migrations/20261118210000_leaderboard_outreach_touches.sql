-- Leaderboard: the Outreach column counts touches, the same as the weekly
-- outreach goal (20261118200000_weekly_touches.sql). A touch is any work a
-- person does on a lead (a logged call, text, email, meeting or note, a stage
-- move, a follow-up date, an edit, adding it), counted once per lead per day.
-- Before, it counted every logged call, text, email and meeting, and nothing
-- else. Everything else is the same as 20261115211941_points_closed_sales.sql,
-- and the return columns don't change.

create or replace function public.team_leaderboard(p_period text default 'week')
returns table (
  user_id      uuid,
  full_name    text,
  outreach     bigint,
  calls_booked bigint,
  deals_won    bigint,
  revenue      numeric,
  sale_bonus   numeric
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
  if p_period is null or p_period not in ('day', 'week', 'month', 'all') then
    raise exception 'Unknown period: %', p_period using errcode = '22023';
  end if;

  if p_period = 'all' then
    v_start_date := '-infinity'::date;
    v_start := '-infinity'::timestamptz;
  else
    v_start_date := date_trunc(p_period, public.today_ny())::date;
    v_start := v_start_date::timestamp at time zone 'America/New_York';
  end if;

  return query
  with touches as (
    select t.user_id as id, count(*) as n
    from public.lead_touches t
    where t.day >= v_start_date
      and t.day <= public.today_ny()
    group by t.user_id
  ),
  moves as (
    select l.owner_id as id, count(distinct l.id) as booked
    from public.activities a
    join public.leads l on l.id = a.lead_id
    where a.created_at >= v_start
      and a.type = 'stage_change'
      and a.to_stage = 'call_booked'
      and a.from_stage is distinct from 'quote_given'
      and a.from_stage is distinct from 'won'
      and l.owner_id is not null
    group by l.owner_id
  ),
  wins as (
    select l.owner_id as id,
           count(*) as deals,
           coalesce(sum(l.deal_value), 0) as total,
           coalesce(sum(greatest(ceil(l.deal_value - 499), 0)), 0) as bonus
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
         coalesce(m.booked, 0),
         coalesce(w.deals, 0),
         coalesce(w.total, 0),
         coalesce(w.bonus, 0)
  from public.profiles p
  left join touches t on t.id = p.id
  left join moves m on m.id = p.id
  left join wins w on w.id = p.id
  where p.active or t.id is not null or m.id is not null or w.id is not null
  order by p.full_name;
end;
$$;

revoke execute on function public.team_leaderboard(text) from public, anon;
grant execute on function public.team_leaderboard(text) to authenticated, service_role;
