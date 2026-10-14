-- The 24-hour team feed shows reps only, like the leaderboard: what admins
-- do on leads no longer appears in it. Everything else is unchanged.

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
  where a.created_at >= now() - interval '24 hours'
    and a.type <> 'reassignment'
    and p.role = 'rep'
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end;
$$;
