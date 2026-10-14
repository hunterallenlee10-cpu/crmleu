-- Team feed and leaderboard on the Today page.
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'rep.a@test.local', '{"full_name":"Rep A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'rep.b@test.local', '{"full_name":"Rep B"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'rep.c@test.local', '{"full_name":"Rep C"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'gone@test.local',  '{"full_name":"Gone Rep"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set active = false where id = '00000000-0000-0000-0000-0000000000d1';

create function pg_temp.login_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant all on all tables in schema pg_temp to public;
grant all on all sequences in schema pg_temp to public;

insert into public.leads (id, business_name, phone, city, owner_id, stage, deal_value, won_date) values
  ('44444444-0000-0000-0000-000000000001', 'Board A Open',  '9995552001', 'Testville', '00000000-0000-0000-0000-0000000000a1', 'contacted', null, null),
  ('44444444-0000-0000-0000-000000000002', 'Board A Close', '9995552002', 'Testville', '00000000-0000-0000-0000-0000000000a1', 'proposal_sent', 2500, null),
  ('44444444-0000-0000-0000-000000000003', 'Board B Open',  '9995552003', 'Testville', '00000000-0000-0000-0000-0000000000b1', 'contacted', null, null),
  ('44444444-0000-0000-0000-000000000004', 'Board A Old',   '9995552004', 'Testville', '00000000-0000-0000-0000-0000000000a1', 'won', 900,
     date_trunc('month', public.today_ny())::date - 1);

insert into public.activities (lead_id, user_id, type, created_at) values
  ('44444444-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'call', now() - interval '40 days');
-- The admin works a lead too. That stays off both the feed and the leaderboard.
insert into public.activities (lead_id, user_id, type) values
  ('44444444-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'call');

-------------------------------------------------------------------------------
-- Rep A works their leads.
select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');

insert into public.activities (lead_id, type, body) values
  ('44444444-0000-0000-0000-000000000001', 'call', 'Private note text'),
  ('44444444-0000-0000-0000-000000000001', 'text', null),
  ('44444444-0000-0000-0000-000000000001', 'note', 'Notes are not outreach');
update public.leads set stage = 'spec_sent' where id = '44444444-0000-0000-0000-000000000001';
-- Going back and forth still counts the lead once.
update public.leads set stage = 'contacted' where id = '44444444-0000-0000-0000-000000000001';
update public.leads set stage = 'spec_sent' where id = '44444444-0000-0000-0000-000000000001';
update public.leads set stage = 'won' where id = '44444444-0000-0000-0000-000000000002';

select results_eq(
  $$select to_stage::text from public.activities
    where lead_id = '44444444-0000-0000-0000-000000000002' and type = 'stage_change'$$,
  $$values ('won')$$,
  'stage changes record the stage they moved to'
);
select throws_ok(
  $$insert into public.activities (lead_id, type, to_stage)
    values ('44444444-0000-0000-0000-000000000001', 'call', 'won')$$,
  '23514', null,
  'only stage changes can carry a to_stage'
);

-------------------------------------------------------------------------------
-- Rep B logs a call on their own lead, then looks at the board.
select pg_temp.login_as('00000000-0000-0000-0000-0000000000b1');
insert into public.activities (lead_id, type) values ('44444444-0000-0000-0000-000000000003', 'call');

select results_eq(
  $$select count(*)::int from public.team_feed() where actor_name = 'Rep A'$$,
  $$values (7)$$,
  'a rep sees everything other reps did in the last 24 hours'
);
select is_empty(
  $$select 1 from public.team_feed()
    where user_id = '00000000-0000-0000-0000-0000000000a1'
      and (lead_id is not null or business_name is not null)$$,
  'but not which leads other reps worked'
);
select results_eq(
  $$select business_name from public.team_feed() where user_id = '00000000-0000-0000-0000-0000000000b1'$$,
  $$values ('Board B Open')$$,
  'a rep sees the business name on their own entries'
);
select results_eq(
  $$select deal_value from public.team_feed()
    where to_stage = 'won' and user_id = '00000000-0000-0000-0000-0000000000a1'$$,
  $$values (2500.00::numeric)$$,
  'wins show the deal value to everyone'
);
select is_empty(
  $$select 1 from public.team_feed() where created_at < now() - interval '24 hours'$$,
  'the feed only covers the last 24 hours'
);

select results_eq(
  $$select outreach::int, specs_sent::int, calls_booked::int, deals_won::int, revenue
    from public.team_leaderboard('month') where full_name = 'Rep A'$$,
  $$values (2, 1, 0, 1, 2500.00::numeric)$$,
  'leaderboard counts outreach, distinct specs, and this month''s wins'
);
select results_eq(
  $$select outreach::int from public.team_leaderboard('day') where full_name = 'Rep B'$$,
  $$values (1)$$,
  'today''s leaderboard'
);
select results_eq(
  $$select b.full_name from public.team_leaderboard('week') b
    where b.user_id::text like '00000000-0000-0000-0000-%' order by b.full_name$$,
  $$values ('Rep A'), ('Rep B'), ('Rep C')$$,
  'every active rep is on the board, even with no score; admins and inactive users without a score are not'
);
select is_empty(
  $$select 1 from public.team_leaderboard('day') where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  'admins stay off the leaderboard even when they log outreach'
);
select is_empty(
  $$select 1 from public.team_feed() where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  'admins stay out of the team feed too'
);
select throws_ok(
  $$select * from public.team_leaderboard('year')$$,
  '22023', null,
  'unknown periods are rejected'
);
select is_empty(
  $$select 1 from public.activities where user_id = '00000000-0000-0000-0000-0000000000a1'$$,
  'reps still cannot read other reps'' activities directly'
);

-------------------------------------------------------------------------------
-- Reassignments aren't team news.
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');
update public.leads set owner_id = '00000000-0000-0000-0000-0000000000c1'
where id = '44444444-0000-0000-0000-000000000003';

select is_empty(
  $$select 1 from public.team_feed() where type = 'reassignment'$$,
  'reassignments are left out of the feed'
);
select isnt_empty(
  $$select 1 from public.team_feed() where business_name = 'Board A Open'$$,
  'admins see business names on everyone''s entries'
);

-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000d1');
select throws_ok(
  'select * from public.team_feed()',
  '42501', null,
  'deactivated users cannot read the feed'
);

reset role;
set local role anon;
select throws_ok(
  'select * from public.team_leaderboard()',
  '42501', null,
  'logged-out visitors cannot read the leaderboard'
);

select * from finish();
rollback;
