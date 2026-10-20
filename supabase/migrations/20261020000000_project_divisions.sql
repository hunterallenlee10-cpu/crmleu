-- Divisions: the parts of the business a project belongs to (Websites, Ads,
-- CRM...). They are the spokes on the Projects map. Each project belongs to
-- exactly one division.
--
-- Rules enforced here (not just in the UI):
--   * Everyone on the team can read the divisions.
--   * Only admins add, rename, reorder or remove them.
--   * A division can't be removed while any project still belongs to it.
--   * Names are unique (ignoring case) and can't be blank.

create table public.project_divisions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),

  constraint project_division_name_present check (btrim(name) <> ''),
  constraint project_division_name_length check (char_length(name) <= 40)
);

create unique index project_divisions_name_unique on public.project_divisions (lower(name));
create index project_divisions_position_idx on public.project_divisions (position, created_at);

create function public.project_divisions_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  return new;
end;
$$;

create trigger project_divisions_before_write
  before insert or update on public.project_divisions
  for each row execute function public.project_divisions_before_write();

-- Start with the business's current divisions, clockwise from the top of the map.
insert into public.project_divisions (name, position) values
  ('AI Auto', 0),
  ('Websites', 1),
  ('SEO / Google Rank', 2),
  ('Social Media', 3),
  ('Consulting', 4),
  ('CRM', 5),
  ('Ecom', 6),
  ('BM', 7),
  ('Ads', 8),
  ('Selling TRW', 9),
  ('Crypto', 10),
  ('Clothes', 11);

-- Existing projects keep a null division until an admin picks one; the app
-- requires a division whenever a project is created or saved.
alter table public.projects
  add column division_id uuid references public.project_divisions (id) on delete restrict;

create index projects_division_idx on public.projects (division_id);

-------------------------------------------------------------------------------
-- Row-level security
-------------------------------------------------------------------------------

alter table public.project_divisions enable row level security;

create policy "project_divisions: read for the team"
  on public.project_divisions for select to authenticated
  using ((select public.is_active_user()));

create policy "project_divisions: admin insert"
  on public.project_divisions for insert to authenticated
  with check ((select public.is_admin()));

create policy "project_divisions: admin update"
  on public.project_divisions for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "project_divisions: admin delete"
  on public.project_divisions for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.project_divisions from anon;
revoke execute on function public.project_divisions_before_write() from public, anon;
