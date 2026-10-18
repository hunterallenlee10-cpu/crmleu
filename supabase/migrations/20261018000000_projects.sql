-- Projects: the admin hands a project to one team member, and each project
-- has a checklist of things to get done.
--
-- Rules enforced here (not just in the UI):
--   * Only admins create, edit, reassign or delete projects and checklist items.
--   * The person a project is assigned to can see it and tick items off,
--     but can't rename, add, move or delete items.
--   * Nobody else can see the project.

-------------------------------------------------------------------------------
-- Tables
-------------------------------------------------------------------------------

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  assignee_id uuid references public.profiles (id) on delete set null,  -- null = unassigned
  due_date    date,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint project_name_present check (btrim(name) <> '')
);

create index projects_assignee_idx on public.projects (assignee_id);

create table public.project_tasks (
  id         bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  title      text not null,
  position   integer not null default 0,
  done       boolean not null default false,
  done_at    timestamptz,
  done_by    uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint project_task_title_present check (btrim(title) <> '')
);

create index project_tasks_project_idx on public.project_tasks (project_id, position, id);

-------------------------------------------------------------------------------
-- Triggers
-------------------------------------------------------------------------------

create function public.projects_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger projects_before_write
  before insert or update on public.projects
  for each row execute function public.projects_before_write();

-- Assignees may only tick items on and off. Also records who ticked an item
-- and when, so the admin can see it.
create function public.project_tasks_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and not public.is_admin() then
    if new.title is distinct from old.title
      or new.position is distinct from old.position
      or new.project_id is distinct from old.project_id then
      raise exception 'Only an admin can edit checklist items' using errcode = '42501';
    end if;
  end if;

  new.title := btrim(new.title);

  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_at := now();
    new.done_by := auth.uid();
  elsif not new.done then
    new.done_at := null;
    new.done_by := null;
  else
    -- Still done: keep the original who/when.
    new.done_at := old.done_at;
    new.done_by := old.done_by;
  end if;

  return new;
end;
$$;

create trigger project_tasks_before_write
  before insert or update on public.project_tasks
  for each row execute function public.project_tasks_before_write();

-- Ticking an item counts as activity on the project.
create function public.project_tasks_touch_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.projects set updated_at = now()
  where id = coalesce(new.project_id, old.project_id);
  return null;
end;
$$;

create trigger project_tasks_touch_project
  after insert or update or delete on public.project_tasks
  for each row execute function public.project_tasks_touch_project();

-------------------------------------------------------------------------------
-- Row-level security
-------------------------------------------------------------------------------

alter table public.projects enable row level security;
alter table public.project_tasks enable row level security;

create policy "projects: read assigned or admin"
  on public.projects for select to authenticated
  using (
    (select public.is_admin())
    or (assignee_id = (select auth.uid()) and (select public.is_active_user()))
  );

create policy "projects: admin insert"
  on public.projects for insert to authenticated
  with check ((select public.is_admin()));

create policy "projects: admin update"
  on public.projects for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "projects: admin delete"
  on public.projects for delete to authenticated
  using ((select public.is_admin()));

create policy "project_tasks: read on visible projects"
  on public.project_tasks for select to authenticated
  using (
    (select public.is_admin())
    or (
      (select public.is_active_user())
      and exists (
        select 1 from public.projects p
        where p.id = project_id and p.assignee_id = (select auth.uid())
      )
    )
  );

create policy "project_tasks: admin insert"
  on public.project_tasks for insert to authenticated
  with check ((select public.is_admin()));

-- The trigger above limits assignees to the done flag.
create policy "project_tasks: tick on assigned projects or admin"
  on public.project_tasks for update to authenticated
  using (
    (select public.is_admin())
    or (
      (select public.is_active_user())
      and exists (
        select 1 from public.projects p
        where p.id = project_id and p.assignee_id = (select auth.uid())
      )
    )
  )
  with check (
    (select public.is_admin())
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.assignee_id = (select auth.uid())
    )
  );

create policy "project_tasks: admin delete"
  on public.project_tasks for delete to authenticated
  using ((select public.is_admin()));

-------------------------------------------------------------------------------
-- Grants. Logged-out visitors (anon) get nothing.
-------------------------------------------------------------------------------

revoke all on public.projects, public.project_tasks from anon;
revoke execute on function
  public.projects_before_write(),
  public.project_tasks_before_write(),
  public.project_tasks_touch_project()
from public, anon;
