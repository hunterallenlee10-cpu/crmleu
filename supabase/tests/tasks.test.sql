-- Task list: everyone sees every task, only the admin manages them, and
-- members tick off only their own or whole-team tasks.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'rep.a@test.local', '{"full_name":"Rep A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'rep.b@test.local', '{"full_name":"Rep B"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'rep.c@test.local', '{"full_name":"Rep C"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set active = false where id = '00000000-0000-0000-0000-0000000000c1';

create function pg_temp.login_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant all on all tables in schema pg_temp to public;
grant all on all sequences in schema pg_temp to public;

-------------------------------------------------------------------------------
-- Admin
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

select lives_ok(
  $$insert into public.tasks (id, title, assignee_id) values
      ('44444444-0000-0000-0000-0000000000a1', 'Call 20 plumbers', '00000000-0000-0000-0000-0000000000a1'),
      ('44444444-0000-0000-0000-0000000000b1', 'Send 5 spec sites', '00000000-0000-0000-0000-0000000000b1'),
      ('44444444-0000-0000-0000-000000000001', 'Team meeting notes', null)$$,
  'admin can create and assign tasks'
);
select is(
  (select created_by from public.tasks where id = '44444444-0000-0000-0000-0000000000a1'),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'created_by defaults to the admin'
);

-------------------------------------------------------------------------------
-- Rep A
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');

select results_eq(
  'select count(*)::int from public.tasks',
  'values (3)',
  'rep A sees every task, including rep B''s'
);

select throws_ok(
  $$insert into public.tasks (title, assignee_id) values ('Self-assigned', '00000000-0000-0000-0000-0000000000a1')$$,
  '42501', null,
  'rep A cannot create tasks'
);

select is_empty(
  $$update public.tasks set title = 'Renamed' where id = '44444444-0000-0000-0000-0000000000a1' returning id$$,
  'rep A cannot edit their own task directly'
);
select is_empty(
  $$update public.tasks set completed_at = now(), completed_by = auth.uid()
    where id = '44444444-0000-0000-0000-0000000000b1' returning id$$,
  'rep A cannot tick off rep B''s task by updating the table'
);
select is_empty(
  $$delete from public.tasks where id = '44444444-0000-0000-0000-0000000000a1' returning id$$,
  'rep A cannot delete tasks'
);

select lives_ok(
  $$select public.set_task_done('44444444-0000-0000-0000-0000000000a1', true)$$,
  'rep A can tick off their own task'
);
select lives_ok(
  $$select public.set_task_done('44444444-0000-0000-0000-000000000001', true)$$,
  'rep A can tick off a whole-team task'
);
select throws_ok(
  $$select public.set_task_done('44444444-0000-0000-0000-0000000000b1', true)$$,
  '42501', null,
  'rep A cannot tick off rep B''s task'
);

select results_eq(
  $$select completed_by, completed_at is not null from public.tasks
    where id = '44444444-0000-0000-0000-0000000000a1'$$,
  $$values ('00000000-0000-0000-0000-0000000000a1'::uuid, true)$$,
  'ticking off records who did it and when'
);
select results_eq(
  $$select title from public.tasks where id = '44444444-0000-0000-0000-0000000000a1'$$,
  $$values ('Call 20 plumbers')$$,
  'the title is unchanged'
);

select lives_ok(
  $$select public.set_task_done('44444444-0000-0000-0000-0000000000a1', false)$$,
  'rep A can un-tick their own task'
);
select results_eq(
  $$select completed_by, completed_at from public.tasks where id = '44444444-0000-0000-0000-0000000000a1'$$,
  $$values (null::uuid, null::timestamptz)$$,
  'un-ticking clears who and when'
);

-------------------------------------------------------------------------------
-- Admin can tick off anything; inactive and logged-out users get nothing
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$select public.set_task_done('44444444-0000-0000-0000-0000000000b1', true)$$,
  'admin can tick off anyone''s task'
);

select pg_temp.login_as('00000000-0000-0000-0000-0000000000c1');
select is_empty('select 1 from public.tasks', 'a deactivated member sees no tasks');

reset role;
set local role anon;
select throws_ok('select 1 from public.tasks', '42501', null, 'logged-out visitors cannot read tasks');

select * from finish();
rollback;
