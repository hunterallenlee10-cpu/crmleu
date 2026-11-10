-- Undoing an accidental move out of Won keeps the original won date, and the
-- leaderboard doesn't count it as a new win or a new booking.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'rep.a@test.local', '{"full_name":"Rep A"}');

create function pg_temp.login_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
grant all on all tables in schema pg_temp to public;
grant all on all sequences in schema pg_temp to public;

-- A deal Rep A won 40 days ago (so last month or earlier), and a fresh lead.
insert into public.leads (id, business_name, phone, city, owner_id, stage, deal_value, won_date) values
  ('55555555-0000-0000-0000-000000000001', 'Won Date Old Win', '9995553001', 'Testville',
     '00000000-0000-0000-0000-0000000000a1', 'won', 1000, public.today_ny() - 40),
  ('55555555-0000-0000-0000-000000000002', 'Won Date Fresh',   '9995553002', 'Testville',
     '00000000-0000-0000-0000-0000000000a1', 'contacted', null, null);

-------------------------------------------------------------------------------
-- Rep A clicks Won → Call Booked → Won by mistake.
select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');
update public.leads set stage = 'call_booked' where id = '55555555-0000-0000-0000-000000000001';
update public.leads set stage = 'won' where id = '55555555-0000-0000-0000-000000000001';

select is(
  (select won_date from public.leads where id = '55555555-0000-0000-0000-000000000001'),
  public.today_ny() - 40,
  'going back to Won soon after leaving it keeps the original won date'
);
select results_eq(
  $$select calls_booked::int, deals_won::int from public.team_leaderboard('month')
    where full_name = 'Rep A'$$,
  $$values (0, 0)$$,
  'the undo is neither a new booking nor a new win this month'
);
select results_eq(
  $$select calls_booked::int, deals_won::int from public.team_leaderboard('all')
    where full_name = 'Rep A'$$,
  $$values (0, 1)$$,
  'all time still has the one win'
);

-------------------------------------------------------------------------------
-- Real bookings still count.
update public.leads set stage = 'call_booked' where id = '55555555-0000-0000-0000-000000000002';
select results_eq(
  $$select calls_booked::int from public.team_leaderboard('day') where full_name = 'Rep A'$$,
  $$values (1)$$,
  'a lead moved forward to Call Booked still counts as a booking'
);

-------------------------------------------------------------------------------
-- Reps can't plant a won date to bring back later.
update public.leads set stage = 'won', deal_value = 500 where id = '55555555-0000-0000-0000-000000000002';
update public.leads set stage = 'quote_given' where id = '55555555-0000-0000-0000-000000000002';
update public.leads set last_won_date = '2020-01-01', left_won_at = now()
  where id = '55555555-0000-0000-0000-000000000002';
select is(
  (select last_won_date from public.leads where id = '55555555-0000-0000-0000-000000000002'),
  public.today_ny(),
  'reps can''t change the remembered won date'
);
select is(
  (select won_date from public.leads where id = '55555555-0000-0000-0000-000000000002'),
  null,
  'leaving Won still clears the won date'
);

-------------------------------------------------------------------------------
-- After 7 days out of Won, coming back is a new win with today's date.
update public.leads set stage = 'lost', lost_reason = 'Went quiet'
  where id = '55555555-0000-0000-0000-000000000001';
select pg_temp.logout();
update public.leads set left_won_at = now() - interval '8 days'
  where id = '55555555-0000-0000-0000-000000000001';
select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');
update public.leads set stage = 'won' where id = '55555555-0000-0000-0000-000000000001';

select is(
  (select won_date from public.leads where id = '55555555-0000-0000-0000-000000000001'),
  public.today_ny(),
  'coming back to Won after 7 days is a new win'
);
select results_eq(
  $$select last_won_date, left_won_at from public.leads
    where id = '55555555-0000-0000-0000-000000000001'$$,
  $$values (null::date, null::timestamptz)$$,
  'the remembered date is cleared once the lead is Won again'
);

-- Admins and server code can still set any won date.
select pg_temp.logout();
update public.leads set won_date = public.today_ny() - 3
  where id = '55555555-0000-0000-0000-000000000001';
select is(
  (select won_date from public.leads where id = '55555555-0000-0000-0000-000000000001'),
  public.today_ny() - 3,
  'server code can still correct a won date'
);

select * from finish();
rollback;
