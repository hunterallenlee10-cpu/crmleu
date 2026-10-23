-- Team hierarchy: each person can have a job title and someone they report
-- to. The Ventures page draws this as an org chart that everyone can see.
--
-- Rules enforced here (not just in the UI):
--   * Only admins set titles and who reports to whom (the existing
--     "profiles: admin update" policy already covers this).
--   * Nobody reports to themselves, and the chain can't loop back around.
--   * Titles are trimmed, blank means none, and they're 60 characters max.
--   * Everyone on the team can read names, titles and who reports to whom
--     through team_members (still no emails or commission rates).

alter table public.profiles
  add column title      text,
  add column reports_to uuid references public.profiles (id) on delete set null,

  add constraint profile_title_length check (char_length(title) <= 60),
  add constraint profile_not_own_manager check (reports_to <> id);

create index profiles_reports_to_idx on public.profiles (reports_to);

create function public.profiles_before_hierarchy_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_next  uuid := new.reports_to;
  v_steps int := 0;
begin
  new.title := nullif(btrim(regexp_replace(new.title, '\s+', ' ', 'g')), '');

  -- Walk up from the new manager. Reaching this person again means a loop.
  while v_next is not null loop
    if v_next = new.id then
      raise exception 'That would make a loop: they already manage that person, directly or through someone else.'
        using errcode = 'check_violation';
    end if;
    v_steps := v_steps + 1;
    exit when v_steps > 1000;
    select reports_to into v_next from public.profiles where id = v_next;
  end loop;
  return new;
end;
$$;

create trigger profiles_before_hierarchy_write
  before insert or update of title, reports_to on public.profiles
  for each row execute function public.profiles_before_hierarchy_write();

revoke execute on function public.profiles_before_hierarchy_write() from public, anon;

-- New columns go at the end, so the view can be replaced in place and keeps
-- its grants.
create or replace view public.team_members as
  select id, full_name, role, active, title, reports_to from public.profiles;
