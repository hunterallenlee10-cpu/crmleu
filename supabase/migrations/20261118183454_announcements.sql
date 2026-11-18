-- Today page sidebar: the team feed and announcements.
--
--   * The team feed is no longer limited to the last 24 hours. It returns the
--     team's latest entries, however old, so it's never blank on a slow day.
--     Everything else about it (reps only, no other reps' leads) is unchanged.
--   * Announcements: every active team member can read them, only admins post,
--     edit or delete them.

create or replace function public.team_feed(p_limit integer default 500)
returns table (
  id            bigint,
  created_at    timestamptz,
  user_id       uuid,
  actor_name    text,
  type          public.activity_type,
  to_stage      public.lead_stage,
  deal_value    numeric,
  lead_id       uuid,
  business_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
begin
  if auth.uid() is not null and not public.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return query
  select a.id,
         a.created_at,
         a.user_id,
         p.full_name,
         a.type,
         a.to_stage,
         case when a.to_stage = 'won' and l.stage = 'won' then l.deal_value end,
         case when v_admin or l.owner_id = auth.uid() then l.id end,
         case when v_admin or l.owner_id = auth.uid() then l.business_name end
  from public.activities a
  join public.profiles p on p.id = a.user_id
  join public.leads l on l.id = a.lead_id
  where a.type <> 'reassignment'
    and p.role = 'rep'
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end;
$$;

-------------------------------------------------------------------------------
-- Announcements
-------------------------------------------------------------------------------

create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  body       text not null check (btrim(body) <> '' and length(body) <= 2000),
  author_id  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index announcements_created_at_idx on public.announcements (created_at desc);

alter table public.announcements enable row level security;

create policy "announcements: active members read all"
  on public.announcements for select to authenticated
  using ((select public.is_active_user()));

create policy "announcements: admin insert"
  on public.announcements for insert to authenticated
  with check ((select public.is_admin()));

create policy "announcements: admin update"
  on public.announcements for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "announcements: admin delete"
  on public.announcements for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.announcements from anon;
