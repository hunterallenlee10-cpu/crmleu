-- Ventures: the big branches of LEU (Websites, Ads, Crypto...). They replace
-- project divisions as the spokes on the map, and each one now carries what
-- it is, who runs it, a timeline and a status.
--
-- The dots on each branch are now tasks (the team task list), not projects.
-- Every existing project is copied into a task on its venture, so nothing on
-- the map is lost. The old projects tables stay as a read-only archive.
--
-- Rules enforced here (not just in the UI):
--   * Everyone on the team can read the ventures.
--   * Only admins add, edit, reorder or remove them.
--   * Removing a venture keeps its tasks; they just lose their venture.
--   * Names are unique (ignoring case) and can't be blank.

-------------------------------------------------------------------------------
-- project_divisions -> ventures
-------------------------------------------------------------------------------

alter table public.project_divisions rename to ventures;
alter table public.ventures rename constraint project_divisions_pkey to ventures_pkey;
alter table public.ventures rename constraint project_division_name_present to venture_name_present;
alter table public.ventures rename constraint project_division_name_length to venture_name_length;
alter index public.project_divisions_name_unique rename to ventures_name_unique;
alter index public.project_divisions_position_idx rename to ventures_position_idx;

alter policy "project_divisions: read for the team" on public.ventures rename to "ventures: read for the team";
alter policy "project_divisions: admin insert" on public.ventures rename to "ventures: admin insert";
alter policy "project_divisions: admin update" on public.ventures rename to "ventures: admin update";
alter policy "project_divisions: admin delete" on public.ventures rename to "ventures: admin delete";

alter table public.ventures
  add column description text,
  add column lead_id     uuid references public.profiles (id) on delete set null,  -- who runs it
  add column status      text not null default 'building',
  add column start_date  date,
  add column target_date date,
  add column updated_at  timestamptz not null default now(),

  add constraint venture_description_length check (char_length(description) <= 2000),
  add constraint venture_status_valid check (status in ('idea', 'building', 'live', 'paused')),
  add constraint venture_timeline_order check (target_date >= start_date);

create index ventures_lead_idx on public.ventures (lead_id);

drop trigger project_divisions_before_write on public.ventures;
drop function public.project_divisions_before_write();

create function public.ventures_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.description := nullif(btrim(new.description), '');
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger ventures_before_write
  before insert or update on public.ventures
  for each row execute function public.ventures_before_write();

revoke execute on function public.ventures_before_write() from public, anon;

-------------------------------------------------------------------------------
-- Tasks belong to a venture (optional)
-------------------------------------------------------------------------------

alter table public.tasks
  add column venture_id uuid references public.ventures (id) on delete set null;

create index tasks_venture_idx on public.tasks (venture_id);

-------------------------------------------------------------------------------
-- Copy each project into a task on its venture
-------------------------------------------------------------------------------
-- The checklist goes into the task's details as "[x] item" lines. A project
-- whose checklist was all ticked becomes a finished task.

insert into public.tasks
  (title, details, assignee_id, due_date, venture_id, created_by, created_at, completed_at, completed_by)
select
  left(p.name, 200),
  nullif(left(concat_ws(E'\n\n', nullif(btrim(p.description), ''), c.lines), 2000), ''),
  -- Tasks need a real person (or the whole team); keep it that way.
  case when exists (select 1 from public.profiles pr where pr.id = p.assignee_id) then p.assignee_id end,
  p.due_date,
  p.division_id,
  p.created_by,
  p.created_at,
  case when c.total > 0 and c.done = c.total and c.last_by is not null then c.last_at end,
  case when c.total > 0 and c.done = c.total and c.last_by is not null then c.last_by end
from public.projects p
left join lateral (
  select
    count(*) as total,
    count(*) filter (where t.done) as done,
    string_agg(case when t.done then '[x] ' else '[ ] ' end || t.title, E'\n' order by t.position, t.id) as lines,
    max(t.done_at) as last_at,
    (array_agg(coalesce(t.done_by, p.assignee_id, p.created_by) order by t.done_at desc nulls last))[1] as last_by
  from public.project_tasks t
  where t.project_id = p.id
) c on true;

-- The archived projects must not stop a venture from being removed.
alter table public.projects
  drop constraint projects_division_id_fkey,
  add constraint projects_division_id_fkey
    foreign key (division_id) references public.ventures (id) on delete set null;
