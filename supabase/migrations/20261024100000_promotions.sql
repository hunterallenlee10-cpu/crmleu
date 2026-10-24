-- Promotions up for grabs that admins type in.
--
-- Job-title promotions (President, CFO, Sales Manager, and anything an admin
-- types in on the Team chart) now live in this table instead of the app's
-- code. A title promotion shows as up for grabs until someone active has
-- that title; dragging it onto a person sets their title. Venture lead seats
-- still come from the ventures themselves ("<venture> Lead"). Co-leads are
-- no longer offered on the Team chart; they're still picked in a venture's
-- own form.
--
-- Rules enforced here (not just in the UI):
--   * Everyone on the team can read the promotions.
--   * Only admins add or remove them.
--   * Titles are trimmed with spaces collapsed, can't be blank, are 60
--     characters at most (the same limit as a person's title) and are unique
--     ignoring case.

-------------------------------------------------------------------------------
-- Promotions
-------------------------------------------------------------------------------

create table public.promotions (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  seq        bigint generated always as identity, -- list order: oldest first
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint promotion_title_present check (btrim(title) <> ''),
  constraint promotion_title_length check (char_length(title) <= 60)
);

create unique index promotions_title_unique on public.promotions (lower(title));
create index promotions_seq_idx on public.promotions (seq);

create function public.promotions_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(regexp_replace(new.title, '\s+', ' ', 'g'));
  return new;
end;
$$;

create trigger promotions_before_write
  before insert or update on public.promotions
  for each row execute function public.promotions_before_write();

-- The three the app listed before, in the same order.
insert into public.promotions (title) values ('President');
insert into public.promotions (title) values ('CFO');
insert into public.promotions (title) values ('Sales Manager');

alter table public.promotions enable row level security;

create policy "promotions: read for the team"
  on public.promotions for select to authenticated
  using ((select public.is_active_user()));

create policy "promotions: admin insert"
  on public.promotions for insert to authenticated
  with check ((select public.is_admin()));

create policy "promotions: admin delete"
  on public.promotions for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.promotions from anon;
revoke execute on function public.promotions_before_write() from public, anon;
