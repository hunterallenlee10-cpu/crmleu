-- "Everyone has to check this off": a switch on whole-team tasks.
--
-- A normal whole-team task is done as soon as anyone ticks it. With
-- everyone_must_complete on, each rep ticks it off for themselves, and the
-- task is only done (completed_at set) once every rep who has to has ticked it.
--
-- Who has to: every active rep who was already on the team when the task
-- was created. So a new hire doesn't reopen last month's tasks, and
-- deactivating someone stops a task waiting on them.
--
-- Check-offs live in task_checkoffs and only change through set_task_done().

alter table public.tasks
  add column everyone_must_complete boolean not null default false,
  add constraint everyone_tasks_are_whole_team check (not everyone_must_complete or assignee_id is null);

create table public.task_checkoffs (
  task_id    uuid not null references public.tasks (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  checked_at timestamptz not null default clock_timestamp(),
  primary key (task_id, user_id)
);

-- No policies: nobody reads or writes this table directly. Progress comes
-- from everyone_task_progress() and ticks go through set_task_done().
alter table public.task_checkoffs enable row level security;
revoke all on public.task_checkoffs from anon, authenticated;

-------------------------------------------------------------------------------
-- Keep tasks.completed_at in step with the check-offs.
-------------------------------------------------------------------------------

-- Re-check one everyone task, or all of them when p_task_id is null.
create function public.refresh_everyone_tasks(p_task_id uuid default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_task     record;
  v_required integer;
  v_checked  integer;
  v_by       uuid;
  v_at       timestamptz;
begin
  for v_task in
    select id, created_at from public.tasks
    where everyone_must_complete and (p_task_id is null or id = p_task_id)
  loop
    select count(*), count(c.user_id)
    into v_required, v_checked
    from public.profiles p
    left join public.task_checkoffs c on c.task_id = v_task.id and c.user_id = p.id
    where p.role = 'rep' and p.active and p.created_at <= v_task.created_at;

    v_by := null;
    v_at := null;
    if v_required > 0 and v_checked = v_required then
      -- Done when the last rep ticked it.
      select c.user_id, c.checked_at
      into v_by, v_at
      from public.task_checkoffs c
      join public.profiles p on p.id = c.user_id
      where c.task_id = v_task.id and p.role = 'rep' and p.active and p.created_at <= v_task.created_at
      order by c.checked_at desc
      limit 1;
    end if;

    update public.tasks
    set completed_at = v_at, completed_by = v_by
    where id = v_task.id and completed_at is distinct from v_at;
  end loop;
end;
$$;

-- Turning the switch on for an existing task: work out if it's done yet.
create function public.tasks_after_everyone_on()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_everyone_tasks(new.id);
  return null;
end;
$$;

create trigger tasks_after_everyone_on
  after update of everyone_must_complete on public.tasks
  for each row
  when (new.everyone_must_complete and not old.everyone_must_complete)
  execute function public.tasks_after_everyone_on();

-- A rep deactivated (or promoted) may have been the last one a task waited on.
create function public.profiles_after_team_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_everyone_tasks(null);
  return null;
end;
$$;

create trigger profiles_after_team_change
  after update of active, role on public.profiles
  for each row
  when (new.active is distinct from old.active or new.role is distinct from old.role)
  execute function public.profiles_after_team_change();

-------------------------------------------------------------------------------
-- Ticking off: everyone tasks record a check-off for the caller only.
-- (Replaces the version in 20261012000000_tasks.sql.)
-------------------------------------------------------------------------------

create or replace function public.set_task_done(p_task_id uuid, p_done boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_task record;
begin
  if not public.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select assignee_id, everyone_must_complete, created_at
  into v_task
  from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  if v_task.everyone_must_complete then
    if not exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'rep' and active and created_at <= v_task.created_at
    ) then
      raise exception 'Each rep ticks this task off for themselves' using errcode = '42501';
    end if;

    if p_done then
      insert into public.task_checkoffs (task_id, user_id) values (p_task_id, auth.uid())
      on conflict do nothing;
    else
      delete from public.task_checkoffs where task_id = p_task_id and user_id = auth.uid();
    end if;

    perform public.refresh_everyone_tasks(p_task_id);
    return;
  end if;

  if not public.is_admin() and v_task.assignee_id is not null and v_task.assignee_id <> auth.uid() then
    raise exception 'Only the person it''s assigned to can tick off this task' using errcode = '42501';
  end if;

  update public.tasks
  set completed_at = case when p_done then coalesce(completed_at, now()) end,
      completed_by = case when p_done then coalesce(completed_by, auth.uid()) end
  where id = p_task_id;
end;
$$;

-------------------------------------------------------------------------------
-- Progress: one row per rep who has to tick each of the given everyone
-- tasks, with when they did (null = not yet). Names only, like team_members.
-------------------------------------------------------------------------------

create function public.everyone_task_progress(p_task_ids uuid[])
returns table (task_id uuid, user_id uuid, full_name text, checked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, p.id, p.full_name, c.checked_at
  from public.tasks t
  join public.profiles p on p.role = 'rep' and p.active and p.created_at <= t.created_at
  left join public.task_checkoffs c on c.task_id = t.id and c.user_id = p.id
  where t.everyone_must_complete
    and t.id = any (p_task_ids)
    and public.is_active_user()
  order by p.full_name
$$;

-------------------------------------------------------------------------------
-- Grants
-------------------------------------------------------------------------------

revoke execute on function
  public.refresh_everyone_tasks(uuid),
  public.tasks_after_everyone_on(),
  public.profiles_after_team_change(),
  public.everyone_task_progress(uuid[])
from public, anon, authenticated;

grant execute on function public.everyone_task_progress(uuid[]) to authenticated, service_role;
grant execute on function public.refresh_everyone_tasks(uuid) to service_role;
