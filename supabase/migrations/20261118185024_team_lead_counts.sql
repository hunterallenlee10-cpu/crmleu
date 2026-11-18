-- Today leaderboard: the reps holding the most leads.
--
-- Reps can't read each other's leads, so this returns only names and counts.
-- Active reps only: admins hold the unassigned pool, which would always top it.
-- Counts every lead a rep owns right now, whatever its stage.

create function public.team_lead_counts(p_limit integer default 3)
returns table (
  user_id    uuid,
  full_name  text,
  lead_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, count(*)
  from public.profiles p
  join public.leads l on l.owner_id = p.id
  where p.role = 'rep' and p.active
  group by p.id, p.full_name
  order by count(*) desc, p.full_name
  limit least(greatest(coalesce(p_limit, 3), 1), 50);
end;
$$;

revoke execute on function public.team_lead_counts(integer) from public, anon;
grant execute on function public.team_lead_counts(integer) to authenticated, service_role;
