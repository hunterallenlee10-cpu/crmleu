-- Team task list.
--
-- Rules enforced here (not just in the UI):
--   * Every active team member can see every task.
--   * Only admins create, edit, reassign or delete tasks.
--   * A member can tick off (or un-tick) only tasks assigned to them, or tasks
--     for the whole team (no assignee). Admins can tick off any task.

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (btrim(title) <> '' and length(title) <= 200),
  details      text check (details is null or length(details) <= 2000),
  assignee_id  uuid references public.profiles (id) on delete cascade,  -- null = whole team
  due_date     date,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint completed_together check ((completed_at is null) = (completed_by is null))
);

create index tasks_assignee_idx on public.tasks (assignee_id, completed_at);
create index tasks_completed_at_idx on public.tasks (completed_at);

create function public.tasks_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_before_update
  before update on public.tasks
  for each row execute function public.tasks_before_update();

-------------------------------------------------------------------------------
-- Ticking a task off. Members can't update the table directly (that would
-- let them rename or reassign), so completion goes through this function.
-------------------------------------------------------------------------------

create function public.set_task_done(p_task_id uuid, p_done boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_assignee uuid;
begin
  if not public.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select assignee_id into v_assignee from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  if not public.is_admin() and v_assignee is not null and v_assignee <> auth.uid() then
    raise exception 'Only the person it''s assigned to can tick off this task' using errcode = '42501';
  end if;

  update public.tasks
  set completed_at = case when p_done then coalesce(completed_at, now()) end,
      completed_by = case when p_done then coalesce(completed_by, auth.uid()) end
  where id = p_task_id;
end;
$$;

-------------------------------------------------------------------------------
-- Row-level security
-------------------------------------------------------------------------------

alter table public.tasks enable row level security;

create policy "tasks: active members read all"
  on public.tasks for select to authenticated
  using ((select public.is_active_user()));

create policy "tasks: admin insert"
  on public.tasks for insert to authenticated
  with check ((select public.is_admin()));

create policy "tasks: admin update"
  on public.tasks for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "tasks: admin delete"
  on public.tasks for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.tasks from anon;

revoke execute on function public.set_task_done(uuid, boolean) from public, anon;
grant execute on function public.set_task_done(uuid, boolean) to authenticated, service_role;
