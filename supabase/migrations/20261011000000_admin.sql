-- Phase 3: admin dashboard numbers and bulk duplicate checks for CSV import.

-------------------------------------------------------------------------------
-- Dashboard. These run as the caller, so row-level security applies:
-- an admin sees everyone's numbers, a rep would only ever see their own.
-- Weeks start Monday and months start on the 1st, in New York time.
-------------------------------------------------------------------------------

create function public.dashboard_stage_counts()
returns table (owner_id uuid, stage public.lead_stage, lead_count bigint)
language sql
stable
set search_path = ''
as $$
  select owner_id, stage, count(*)
  from public.leads
  group by owner_id, stage
$$;

create function public.dashboard_activity_counts()
returns table (user_id uuid, type public.activity_type, activity_count bigint)
language sql
stable
set search_path = ''
as $$
  select user_id, type, count(*)
  from public.activities
  where user_id is not null
    and created_at >= date_trunc('week', now() at time zone 'America/New_York') at time zone 'America/New_York'
  group by user_id, type
$$;

create function public.dashboard_won_this_month()
returns table (owner_id uuid, deals bigint, revenue numeric)
language sql
stable
set search_path = ''
as $$
  select owner_id, count(*), coalesce(sum(deal_value), 0)
  from public.leads
  where stage = 'won'
    and won_date >= date_trunc('month', public.today_ny())::date
    and won_date <= public.today_ny()
  group by owner_id
$$;

-------------------------------------------------------------------------------
-- Import: check many rows against existing leads in one call.
-- Returns one row per input row that already exists, with 'phone' or 'name_city'.
-------------------------------------------------------------------------------

create function public.check_duplicates_bulk(
  p_phones text[],
  p_business_names text[],
  p_cities text[]
)
returns table (idx integer, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return query
  with input as (
    select (i - 1)::integer as idx,
           public.normalize_phone(p_phones[i]) as phone,
           public.normalize_business_name(p_business_names[i]) as name_norm,
           public.normalize_city(p_cities[i]) as city_norm
    from generate_subscripts(p_business_names, 1) as i
  )
  select input.idx,
         case when exists (select 1 from public.leads l where l.phone = input.phone)
              then 'phone' else 'name_city' end
  from input
  where (input.phone is not null and exists (select 1 from public.leads l where l.phone = input.phone))
     or exists (
          select 1 from public.leads l
          where l.business_name_norm = input.name_norm and l.city_norm = input.city_norm
        );
end;
$$;

revoke execute on function
  public.dashboard_stage_counts(),
  public.dashboard_activity_counts(),
  public.dashboard_won_this_month(),
  public.check_duplicates_bulk(text[], text[], text[])
from public, anon;

grant execute on function
  public.dashboard_stage_counts(),
  public.dashboard_activity_counts(),
  public.dashboard_won_this_month(),
  public.check_duplicates_bulk(text[], text[], text[])
to authenticated, service_role;

-------------------------------------------------------------------------------
-- Distinct niches for filter dropdowns (the API caps responses at 1000 rows,
-- so we don't want to fetch every lead just to list niches). Runs as the
-- caller, so reps only get niches from their own leads.
-------------------------------------------------------------------------------

create view public.lead_niches with (security_invoker = true) as
  select distinct niche from public.leads where niche is not null order by niche;

revoke all on public.lead_niches from anon;
