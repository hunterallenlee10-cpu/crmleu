-- Weekly outreach goal: touches are counted by the database, once per lead
-- per person per day, and only for work the rep did themselves.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'rep.a@test.local', '{"full_name":"Rep A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'rep.b@test.local', '{"full_name":"Rep B"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'gone@test.local',  '{"full_name":"Gone Rep"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set active = false where id = '00000000-0000-0000-0000-0000000000d1';

create function pg_temp.login_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.week_touches(p_name text) returns int language sql as $$
  select touches::int from public.team_weekly_touches() where full_name = p_name
$$;
grant all on all tables in schema pg_temp to public;
grant all on all sequences in schema pg_temp to public;

insert into public.leads (id, business_name, phone, city, owner_id, stage) values
  ('66666666-0000-0000-0000-000000000001', 'Touch One',   '9995554001', 'Testville', '00000000-0000-0000-0000-0000000000a1', 'new'),
  ('66666666-0000-0000-0000-000000000002', 'Touch Two',   '9995554002', 'Testville', '00000000-0000-0000-0000-0000000000a1', 'new'),
  ('66666666-0000-0000-0000-000000000003', 'Touch Three', '9995554003', 'Testville', '00000000-0000-0000-0000-0000000000a1', 'new'),
  ('66666666-0000-0000-0000-000000000004', 'Touch Pool',  '9995554004', 'Testville', '00000000-0000-0000-0000-00000000000a', 'new');

-- Work from before this week doesn't count toward it.
insert into public.activities (lead_id, user_id, type, created_at) values
  ('66666666-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', 'call', now() - interval '8 days');

-------------------------------------------------------------------------------
-- Rep A works lead 1 every way at once, and sets a follow-up on lead 2.
select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');
insert into public.activities (lead_id, type, body) values
  ('66666666-0000-0000-0000-000000000001', 'call', null),
  ('66666666-0000-0000-0000-000000000001', 'note', 'Left a voicemail');
update public.leads set stage = 'contacted' where id = '66666666-0000-0000-0000-000000000001';
update public.leads set stage = 'call_booked' where id = '66666666-0000-0000-0000-000000000001';

select is(pg_temp.week_touches('Rep A'), 1, 'a call, a note and two stage moves on one lead in a day is one touch');

update public.leads set next_follow_up = public.today_ny() + 3 where id = '66666666-0000-0000-0000-000000000002';
select is(pg_temp.week_touches('Rep A'), 2, 'setting a follow-up date is a touch');

-- Saving lead 3 without changing anything isn't.
update public.leads set city = city where id = '66666666-0000-0000-0000-000000000003';
select is(pg_temp.week_touches('Rep A'), 2, 'saving a lead with nothing changed isn''t a touch');

select throws_ok(
  $$insert into public.lead_touches (user_id, lead_id, day)
    values ('00000000-0000-0000-0000-0000000000a1', '66666666-0000-0000-0000-000000000003', public.today_ny())$$,
  '42501', null,
  'reps can''t add touches by hand'
);
select throws_ok(
  $$select public.record_touch('00000000-0000-0000-0000-0000000000a1', '66666666-0000-0000-0000-000000000003', public.today_ny())$$,
  '42501', null,
  'or call the function that records them'
);

-------------------------------------------------------------------------------
-- Rep B looks at the board.
select pg_temp.login_as('00000000-0000-0000-0000-0000000000b1');
select is(
  (select count(*)::int from public.lead_touches),
  0,
  'a rep can''t read another rep''s touches directly'
);
select is(pg_temp.week_touches('Rep A'), 2, 'but sees everyone''s weekly count');
select is(pg_temp.week_touches('Rep B'), 0, 'reps with nothing yet show 0');
select is(
  (select count(*)::int from public.team_weekly_touches()
    where full_name in ('Admin', 'Gone Rep')),
  0,
  'only active reps are on the weekly goal'
);

-------------------------------------------------------------------------------
-- The admin hands Rep A a lead and edits another. Neither is Rep A's work.
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');
update public.leads set owner_id = '00000000-0000-0000-0000-0000000000a1' where id = '66666666-0000-0000-0000-000000000004';
update public.leads set city = 'Elsewhere' where id = '66666666-0000-0000-0000-000000000003';
select is(pg_temp.week_touches('Rep A'), 2, 'an admin assigning or editing a rep''s lead doesn''t count for the rep');

-- Deleting a lead keeps the work done on it.
delete from public.leads where id = '66666666-0000-0000-0000-000000000001';
select is(pg_temp.week_touches('Rep A'), 2, 'deleting a lead doesn''t take touches away');

select pg_temp.login_as('00000000-0000-0000-0000-0000000000d1');
select throws_ok(
  'select * from public.team_weekly_touches()',
  '42501', null,
  'deactivated users can''t read the weekly goal'
);

select * from finish();
rollback;
