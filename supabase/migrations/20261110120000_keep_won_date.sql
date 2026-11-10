-- Undoing an accidental move out of Won keeps the original won date.
--
-- Before, leaving Won wiped the won date and coming back to Won stamped
-- today's date. So a rep who clicked Won → Call Booked → Won by mistake made an
-- old sale look like a new one on this week's leaderboard and in this month's
-- totals.
--
-- Now, when a lead leaves Won, it remembers its won date. If it comes back to
-- Won within 7 days, it gets that date back. After 7 days it counts as a new
-- win and gets today's date, as before. Admins can still set any won date.
--
-- The leaderboard also stops counting a move back to Call Booked from Quote
-- Given or Won as a new booking. To tell, each stage change now records the
-- stage it came from, as well as the one it went to.

alter table public.leads
  add column last_won_date date,         -- won date before the lead last left Won
  add column left_won_at   timestamptz;  -- when it last left Won

-- Same as 20261010000000_init.sql, except for the won date block.
create or replace function public.leads_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  -- Only admins (or server-side code with no user, e.g. the API) may reassign
  -- a lead or change where it came from.
  if tg_op = 'UPDATE' and auth.uid() is not null and not public.is_admin() then
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Only an admin can reassign leads' using errcode = '42501';
    end if;
    if new.source is distinct from old.source then
      raise exception 'Only an admin can change a lead''s source' using errcode = '42501';
    end if;
  end if;

  -- Phone: store 10 digits or nothing.
  if new.phone is null or btrim(new.phone) = '' then
    new.phone := null;
  else
    v_phone := public.normalize_phone(new.phone);
    if v_phone is null then
      raise exception 'Invalid US phone number: %', new.phone using errcode = '22023';
    end if;
    new.phone := v_phone;
  end if;

  new.business_name := btrim(new.business_name);

  -- Reps can't set the remembered won date themselves.
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.last_won_date := null;
      new.left_won_at := null;
    else
      new.last_won_date := old.last_won_date;
      new.left_won_at := old.left_won_at;
    end if;
  end if;

  -- Won date: set when a lead becomes Won, cleared when it leaves Won.
  if new.stage = 'won' then
    if tg_op = 'INSERT' then
      new.won_date := coalesce(new.won_date, public.today_ny());
    elsif old.stage <> 'won' then
      -- Back in Won soon after leaving it: keep the original date.
      if old.left_won_at > now() - interval '7 days' then
        new.won_date := coalesce(new.won_date, old.last_won_date);
      end if;
      new.won_date := coalesce(new.won_date, public.today_ny());
      new.last_won_date := null;
      new.left_won_at := null;
    elsif auth.uid() is not null and not public.is_admin() then
      new.won_date := old.won_date;  -- reps can't move a win into another month
    end if;
  else
    if tg_op = 'UPDATE' and old.stage = 'won' then
      new.last_won_date := old.won_date;
      new.left_won_at := now();
    end if;
    new.won_date := null;
  end if;

  if new.stage <> 'lost' then
    new.lost_reason := null;
  end if;

  -- Track when the current owner got the lead.
  if tg_op = 'INSERT' then
    if new.owner_id is not null then
      new.assigned_at := coalesce(new.assigned_at, now());
    end if;
  elsif new.owner_id is distinct from old.owner_id then
    new.assigned_at := case when new.owner_id is null then null else now() end;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

-------------------------------------------------------------------------------
-- Record which stage a stage change came from.
-------------------------------------------------------------------------------

alter table public.activities
  add column from_stage public.lead_stage,
  add constraint from_stage_only_on_stage_change check (from_stage is null or type = 'stage_change');

-- Backfill from the "Old → New" text, including the old stage names.
alter table public.activities disable trigger activities_block_update;
update public.activities a
set from_stage = s.value
from (values
  ('New', 'new'::public.lead_stage), ('Contacted', 'contacted'),
  ('Spec Sent', 'warm_up_program'), ('Warm Up Program', 'warm_up_program'),
  ('Call Booked', 'call_booked'),
  ('Proposal Sent', 'quote_given'), ('Quote Given', 'quote_given'),
  ('Won', 'won'), ('Lost', 'lost')
) as s (label, value)
where a.type = 'stage_change'
  and a.from_stage is null
  and split_part(a.body, ' → ', 1) = s.label;
alter table public.activities enable trigger activities_block_update;

-- Same as 20261013100000_team_board.sql, plus from_stage.
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
    insert into public.activities (lead_id, user_id, type, body, from_stage, to_stage)
    values (
      new.id,
      auth.uid(),
      'stage_change',
      public.stage_label(old.stage) || ' → ' || public.stage_label(new.stage)
        || case when new.stage = 'lost' then ' (reason: ' || new.lost_reason || ')' else '' end
        || case when new.stage = 'won' then ' ($' || new.deal_value::text || ')' else '' end,
      old.stage,
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
-- Leaderboard: same as 20261109203435_retire_warm_up_program.sql, except a
-- lead moved back to Call Booked from Quote Given or Won isn't a new booking.
-------------------------------------------------------------------------------

create or replace function public.team_leaderboard(p_period text default 'week')
returns table (
  user_id      uuid,
  full_name    text,
  outreach     bigint,
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
    select a.user_id as id, count(*) as n
    from public.activities a
    where a.created_at >= v_start
      and a.user_id is not null
      and a.type in ('call', 'text', 'email', 'meeting')
    group by a.user_id
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
         coalesce(m.booked, 0),
         coalesce(w.deals, 0),
         coalesce(w.total, 0)
  from public.profiles p
  left join touches t on t.id = p.id
  left join moves m on m.id = p.id
  left join wins w on w.id = p.id
  where p.active or t.id is not null or m.id is not null or w.id is not null
  order by p.full_name;
end;
$$;
