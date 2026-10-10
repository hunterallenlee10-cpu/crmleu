-- LEU CRM: initial schema, triggers, and row-level security.
--
-- Rules enforced here (not just in the UI):
--   * Reps only see and edit leads they own.
--   * Reps cannot reassign or delete leads, or touch activity entries after the fact.
--   * Duplicate leads (same phone, or same business name + city) are rejected.
--   * Stage changes and reassignments are logged to activities automatically.

-------------------------------------------------------------------------------
-- Types
-------------------------------------------------------------------------------

create type public.user_role as enum ('admin', 'rep');

create type public.lead_stage as enum (
  'new', 'contacted', 'spec_sent', 'call_booked', 'proposal_sent', 'won', 'lost'
);

create type public.lead_source as enum ('manual', 'import', 'api');

create type public.service_interest as enum (
  'website', 'automation', 'ai_call_answering', 'multiple'
);

create type public.activity_type as enum (
  'call', 'text', 'email', 'meeting', 'note', 'stage_change', 'reassignment'
);

-------------------------------------------------------------------------------
-- Normalization helpers (the app mirrors these in src/lib/normalize.ts)
-------------------------------------------------------------------------------

-- "(301) 555-1234", "+1 301.555.1234" -> "3015551234". Anything that isn't a
-- 10-digit US number returns null.
create function public.normalize_phone(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^1[0-9]{10}$' then substr(d, 2)
    when d ~ '^[0-9]{10}$' then d
    else null
  end
  from (select regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g') as d) s
$$;

-- "Joe's Pizza, LLC." -> "joes pizza". Lowercase, "&" -> "and", punctuation
-- removed, and trailing LLC / Inc / Corp / Co / Ltd stripped.
create function public.normalize_business_name(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    btrim(regexp_replace(
      regexp_replace(
        regexp_replace(
          replace(lower(coalesce(raw, '')), '&', ' and '),
          '[,/\\_-]', ' ', 'g'),          -- separators become spaces
        '[^a-z0-9 ]', '', 'g'),           -- other punctuation disappears ("l.l.c." -> "llc")
      '\s+', ' ', 'g')),
    '( (llc|inc|corp|co|ltd))+$', ''))
$$;

create function public.normalize_city(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(lower(coalesce(raw, '')), '\s+', ' ', 'g'))
$$;

-- Today's date in the company timezone.
create function public.today_ny()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/New_York')::date
$$;

-------------------------------------------------------------------------------
-- Tables
-------------------------------------------------------------------------------

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  full_name        text not null,
  email            text not null unique,
  role             public.user_role not null default 'rep',
  active           boolean not null default true,
  commission_rate  numeric(5, 2) not null default 0
                     check (commission_rate >= 0 and commission_rate <= 100),
  last_assigned_at timestamptz,  -- round-robin pointer for API + import
  created_at       timestamptz not null default now()
);

create table public.leads (
  id                 uuid primary key default gen_random_uuid(),
  business_name      text not null,
  business_name_norm text generated always as (public.normalize_business_name(business_name)) stored,
  contact_name       text,
  phone              text,  -- always stored as 10 digits (see leads_before_write)
  email              text,
  website            text,
  city               text,
  city_norm          text generated always as (public.normalize_city(city)) stored,
  state              text,
  niche              text,
  source             public.lead_source not null default 'manual',
  stage              public.lead_stage not null default 'new',
  owner_id           uuid references public.profiles (id),
  assigned_at        timestamptz,
  service_interest   public.service_interest,
  deal_value         numeric(12, 2) check (deal_value is null or deal_value >= 0),
  spec_site_url      text,
  next_follow_up     date,
  do_not_contact     boolean not null default false,
  lost_reason        text,
  won_date           date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint business_name_present check (business_name_norm <> ''),
  constraint phone_format check (phone is null or phone ~ '^[0-9]{10}$'),
  constraint lost_needs_reason check (stage <> 'lost' or coalesce(btrim(lost_reason), '') <> ''),
  constraint won_needs_value check (stage <> 'won' or (deal_value is not null and won_date is not null))
);

-- Duplicate protection lives in the database so it can't be raced or bypassed.
create unique index leads_phone_unique on public.leads (phone) where phone is not null;
create unique index leads_name_city_unique on public.leads (business_name_norm, city_norm);

create index leads_owner_follow_up_idx on public.leads (owner_id, next_follow_up);
create index leads_stage_idx on public.leads (stage);

create table public.activities (
  id         bigint generated always as identity primary key,
  lead_id    uuid not null references public.leads (id) on delete cascade,
  user_id    uuid references public.profiles (id) default auth.uid(),  -- null = system / API
  type       public.activity_type not null,
  body       text,
  created_at timestamptz not null default now()
);

create index activities_lead_idx on public.activities (lead_id, created_at desc);
create index activities_user_created_idx on public.activities (user_id, created_at);

-------------------------------------------------------------------------------
-- Role helpers (security definer so policies can call them without recursion)
-------------------------------------------------------------------------------

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  )
$$;

create function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and active
  )
$$;

-------------------------------------------------------------------------------
-- New auth user -> profile. Always created as a rep; promote admins by hand.
-------------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-------------------------------------------------------------------------------
-- Lead triggers
-------------------------------------------------------------------------------

create function public.stage_label(s public.lead_stage)
returns text
language sql
immutable
set search_path = ''
as $$
  select case s
    when 'new' then 'New'
    when 'contacted' then 'Contacted'
    when 'spec_sent' then 'Spec Sent'
    when 'call_booked' then 'Call Booked'
    when 'proposal_sent' then 'Proposal Sent'
    when 'won' then 'Won'
    when 'lost' then 'Lost'
  end
$$;

create function public.leads_before_write()
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

  -- Won date: set when a lead becomes Won, cleared when it leaves Won.
  if new.stage = 'won' then
    if tg_op = 'INSERT' or old.stage <> 'won' then
      new.won_date := coalesce(new.won_date, public.today_ny());
    elsif auth.uid() is not null and not public.is_admin() then
      new.won_date := old.won_date;  -- reps can't move a win into another commission month
    end if;
  else
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

create trigger leads_before_write
  before insert or update on public.leads
  for each row execute function public.leads_before_write();

create function public.leads_after_update()
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
    insert into public.activities (lead_id, user_id, type, body)
    values (
      new.id,
      auth.uid(),
      'stage_change',
      public.stage_label(old.stage) || ' → ' || public.stage_label(new.stage)
        || case when new.stage = 'lost' then ' (reason: ' || new.lost_reason || ')' else '' end
        || case when new.stage = 'won' then ' ($' || new.deal_value::text || ')' else '' end
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

create trigger leads_after_update
  after update on public.leads
  for each row execute function public.leads_after_update();

-- Activities are append-only: nobody edits them, not even an admin.
create function public.activities_block_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Activities are append-only' using errcode = '42501';
end;
$$;

create trigger activities_block_update
  before update on public.activities
  for each row execute function public.activities_block_update();

-------------------------------------------------------------------------------
-- Duplicate check: tells the caller *that* a lead exists, never whose it is.
-- Returns 'phone', 'name_city', or null.
-------------------------------------------------------------------------------

create function public.check_duplicate(
  p_phone text,
  p_business_name text,
  p_city text,
  p_exclude_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_phone text := public.normalize_phone(p_phone);
begin
  if auth.uid() is not null and not public.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if v_phone is not null and exists (
    select 1 from public.leads
    where phone = v_phone and id is distinct from p_exclude_id
  ) then
    return 'phone';
  end if;

  if exists (
    select 1 from public.leads
    where business_name_norm = public.normalize_business_name(p_business_name)
      and city_norm = public.normalize_city(p_city)
      and id is distinct from p_exclude_id
  ) then
    return 'name_city';
  end if;

  return null;
end;
$$;

-------------------------------------------------------------------------------
-- Round robin: the active rep who was assigned a lead longest ago.
-------------------------------------------------------------------------------

create function public.next_round_robin_rep()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select id into v_id
  from public.profiles
  where role = 'rep' and active
  order by last_assigned_at nulls first, created_at
  limit 1
  for update skip locked;

  if v_id is not null then
    update public.profiles set last_assigned_at = clock_timestamp() where id = v_id;
  end if;

  return v_id;
end;
$$;

-------------------------------------------------------------------------------
-- Names only, so activity history can show who did what without exposing
-- other reps' emails or commission rates. Runs as the view owner (bypasses RLS).
-------------------------------------------------------------------------------

create view public.team_members as
  select id, full_name, role, active from public.profiles;

-------------------------------------------------------------------------------
-- Row-level security
-------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.activities enable row level security;

-- profiles: you can read yourself; admins read and edit everyone.
-- (Rows are created by the auth trigger, so there is no insert policy.)
create policy "profiles: read own or admin"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles: admin update"
  on public.profiles for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- leads
create policy "leads: read own or admin"
  on public.leads for select to authenticated
  using (
    (select public.is_admin())
    or (owner_id = (select auth.uid()) and (select public.is_active_user()))
  );

create policy "leads: reps create their own manual leads; admin any"
  on public.leads for insert to authenticated
  with check (
    (select public.is_admin())
    or (
      owner_id = (select auth.uid())
      and source = 'manual'
      and (select public.is_active_user())
    )
  );

create policy "leads: edit own or admin"
  on public.leads for update to authenticated
  using (
    (select public.is_admin())
    or (owner_id = (select auth.uid()) and (select public.is_active_user()))
  )
  with check (
    (select public.is_admin())
    or owner_id = (select auth.uid())
  );

create policy "leads: admin delete"
  on public.leads for delete to authenticated
  using ((select public.is_admin()));

-- activities
create policy "activities: read on visible leads"
  on public.activities for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.leads l
      where l.id = lead_id and l.owner_id = (select auth.uid())
    )
  );

create policy "activities: log on own leads"
  on public.activities for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      (select public.is_admin())
      or (
        type in ('call', 'text', 'email', 'meeting', 'note')
        and (select public.is_active_user())
        and exists (
          select 1 from public.leads l
          where l.id = lead_id and l.owner_id = (select auth.uid())
        )
      )
    )
  );

create policy "activities: admin delete"
  on public.activities for delete to authenticated
  using ((select public.is_admin()));

-------------------------------------------------------------------------------
-- Grants. Logged-out visitors (anon) get nothing.
-------------------------------------------------------------------------------

revoke all on public.profiles, public.leads, public.activities, public.team_members from anon;
revoke all on public.team_members from authenticated;
grant select on public.team_members to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.normalize_phone(text),
  public.normalize_business_name(text),
  public.normalize_city(text),
  public.today_ny(),
  public.is_admin(),
  public.is_active_user(),
  public.stage_label(public.lead_stage),
  public.check_duplicate(text, text, text, uuid),
  public.next_round_robin_rep()
to authenticated, service_role;
