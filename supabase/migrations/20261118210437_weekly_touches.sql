-- Weekly outreach goal: every rep aims for 100 touches a week.
--
-- A touch is anything a person does on a lead: logging a call, text, email,
-- meeting or note, moving its stage, setting a follow-up date, editing its
-- details, or adding it. Each lead counts once per person per day (New York
-- time), so clicking a lead back and forth, or logging a call and then moving
-- its stage, is still one touch. The same lead worked again on another day
-- counts again.
--
-- Touches are recorded by triggers, so they can't be faked from the browser:
--   * activities: every entry with a person on it, except reassignments
--     (those are the admin handing leads out, not the rep working them).
--   * leads: any insert or real change made by the lead's own owner. An admin
--     reassigning or editing a rep's lead doesn't count for the rep.
-- A touch survives the lead being deleted, so an admin cleaning up the
-- pipeline never takes work away from a rep.
--
-- team_weekly_touches() returns this week's count (Monday to Sunday, New York
-- time) for every active rep. Like the leaderboard, it returns only names and
-- counts. The goal itself (100) lives in the app: src/lib/leaderboard.ts.

create table public.lead_touches (
  id      bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  day     date not null
);

create unique index lead_touches_once_a_day on public.lead_touches (user_id, lead_id, day);
create index lead_touches_day_idx on public.lead_touches (day, user_id);

alter table public.lead_touches enable row level security;

-- Written only by the triggers below; people can read their own.
create policy "lead_touches: read own, admin all"
  on public.lead_touches for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.lead_touches from anon;
revoke insert, update, delete, truncate on public.lead_touches from authenticated;

create function public.record_touch(p_user uuid, p_lead uuid, p_day date)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.lead_touches (user_id, lead_id, day)
  select p_user, p_lead, p_day
  where p_user is not null
    and exists (select 1 from public.profiles where id = p_user)
  on conflict (user_id, lead_id, day) do nothing;
$$;

revoke execute on function public.record_touch(uuid, uuid, date) from public, anon, authenticated;

create function public.activities_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and new.type <> 'reassignment' then
    perform public.record_touch(new.user_id, new.lead_id, (new.created_at at time zone 'America/New_York')::date);
  end if;
  return null;
end;
$$;

create trigger activities_touch
  after insert on public.activities
  for each row execute function public.activities_touch();

create function public.leads_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or new.owner_id is distinct from auth.uid() then
    return null;
  end if;
  -- Saving a form with nothing changed isn't work.
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
    return null;
  end if;
  perform public.record_touch(auth.uid(), new.id, public.today_ny());
  return null;
end;
$$;

create trigger leads_touch
  after insert or update on public.leads
  for each row execute function public.leads_touch();

-- Everything already in the history counts. Older lead edits and follow-up
-- dates were never logged, so they can't be counted back.
insert into public.lead_touches (user_id, lead_id, day)
select distinct a.user_id, a.lead_id, (a.created_at at time zone 'America/New_York')::date
from public.activities a
join public.profiles p on p.id = a.user_id
where a.type <> 'reassignment'
on conflict (user_id, lead_id, day) do nothing;

create function public.team_weekly_touches()
returns table (
  user_id   uuid,
  full_name text,
  touches   bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_week_start date := date_trunc('week', public.today_ny())::date;
begin
  if auth.uid() is not null and not public.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, count(t.id)
  from public.profiles p
  left join public.lead_touches t
    on t.user_id = p.id
   and t.day >= v_week_start
   and t.day <= public.today_ny()
  where p.role = 'rep' and p.active
  group by p.id, p.full_name
  order by count(t.id) desc, p.full_name;
end;
$$;

revoke execute on function public.team_weekly_touches() from public, anon;
grant execute on function public.team_weekly_touches() to authenticated, service_role;
