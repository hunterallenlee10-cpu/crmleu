-- "Everyone has to check this off" tasks: each rep ticks for themselves,
-- and the task is only done when all of them have.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'rep.a@test.local', '{"full_name":"Rep A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'rep.b@test.local', '{"full_name":"Rep B"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'rep.c@test.local', '{"full_name":"Rep C"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'rep.d@test.local', '{"full_name":"Rep D (new hire)"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set active = false where id = '00000000-0000-0000-0000-0000000000c1';
-- Rep D joins after the tasks below were created.
update public.profiles set created_at = now() + interval '1 day' where id = '00000000-0000-0000-0000-0000000000d1';

create function pg_temp.login_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant all on all tables in schema pg_temp to public;
grant all on all sequences in schema pg_temp to public;

-------------------------------------------------------------------------------
-- Admin sets up tasks
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

select lives_ok(
  $$insert into public.tasks (id, title, everyone_must_complete) values
      ('55555555-0000-0000-0000-000000000001', 'Watch the pitch training', true),
      ('55555555-0000-0000-0000-000000000002', 'Read the price sheet', false)$$,
  'admin can create an everyone task'
);
select throws_ok(
  $$insert into public.tasks (title, assignee_id, everyone_must_complete)
    values ('Both', '00000000-0000-0000-0000-0000000000a1', true)$$,
  '23514', null,
  'an everyone task cannot have a single assignee'
);
select throws_ok(
  $$select public.set_task_done('55555555-0000-0000-0000-000000000001', true)$$,
  '42501', null,
  'the admin cannot tick an everyone task off for the reps'
);
select results_eq(
  $$select user_id from public.everyone_task_progress(array['55555555-0000-0000-0000-000000000001'::uuid])
    order by user_id$$,
  $$values ('00000000-0000-0000-0000-0000000000a1'::uuid), ('00000000-0000-0000-0000-0000000000b1'::uuid)$$,
  'only active reps who were on the team when it was created have to tick it'
);

-------------------------------------------------------------------------------
-- Rep A ticks: not done yet
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');

select lives_ok(
  $$select public.set_task_done('55555555-0000-0000-0000-000000000001', true)$$,
  'rep A can tick off the everyone task'
);
select is(
  (select completed_at from public.tasks where id = '55555555-0000-0000-0000-000000000001'),
  null,
  'one rep ticking it does not finish it'
);
select results_eq(
  $$select user_id, checked_at is not null from public.everyone_task_progress(array['55555555-0000-0000-0000-000000000001'::uuid])
    order by user_id$$,
  $$values ('00000000-0000-0000-0000-0000000000a1'::uuid, true), ('00000000-0000-0000-0000-0000000000b1'::uuid, false)$$,
  'progress shows who has ticked it'
);
select throws_ok(
  'select * from public.task_checkoffs',
  '42501', null,
  'check-offs cannot be read directly'
);
select throws_ok(
  $$insert into public.task_checkoffs (task_id, user_id)
    values ('55555555-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1')$$,
  '42501', null,
  'rep A cannot tick it off for rep B'
);

-------------------------------------------------------------------------------
-- Rep D joined later and isn't on the hook
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000d1');
select throws_ok(
  $$select public.set_task_done('55555555-0000-0000-0000-000000000001', true)$$,
  '42501', null,
  'a rep who joined after the task was created does not tick it'
);

-------------------------------------------------------------------------------
-- Rep B ticks: done. Un-ticking reopens it.
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000b1');

select lives_ok(
  $$select public.set_task_done('55555555-0000-0000-0000-000000000001', true)$$,
  'rep B can tick off the everyone task'
);
select results_eq(
  $$select completed_by, completed_at is not null from public.tasks where id = '55555555-0000-0000-0000-000000000001'$$,
  $$values ('00000000-0000-0000-0000-0000000000b1'::uuid, true)$$,
  'the task is done once every rep has ticked it, credited to the last one'
);
select lives_ok(
  $$select public.set_task_done('55555555-0000-0000-0000-000000000001', true)$$,
  'ticking twice is harmless'
);
select lives_ok(
  $$select public.set_task_done('55555555-0000-0000-0000-000000000001', false)$$,
  'rep B can un-tick it'
);
select is(
  (select completed_at from public.tasks where id = '55555555-0000-0000-0000-000000000001'),
  null,
  'un-ticking reopens the task'
);
select results_eq(
  $$select user_id from public.everyone_task_progress(array['55555555-0000-0000-0000-000000000001'::uuid])
    where checked_at is not null$$,
  $$values ('00000000-0000-0000-0000-0000000000a1'::uuid)$$,
  'rep A''s tick is untouched'
);

-------------------------------------------------------------------------------
-- Team changes and flipping the switch
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

update public.profiles set active = false where id = '00000000-0000-0000-0000-0000000000b1';
select results_eq(
  $$select completed_by, completed_at is not null from public.tasks where id = '55555555-0000-0000-0000-000000000001'$$,
  $$values ('00000000-0000-0000-0000-0000000000a1'::uuid, true)$$,
  'deactivating the last rep it waited on finishes the task'
);

-- A plain whole-team task that rep A ticked, then switched to everyone.
select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');
select public.set_task_done('55555555-0000-0000-0000-000000000002', true);
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');
update public.profiles set active = true where id = '00000000-0000-0000-0000-0000000000b1';
update public.tasks set everyone_must_complete = true where id = '55555555-0000-0000-0000-000000000002';
select is(
  (select completed_at from public.tasks where id = '55555555-0000-0000-0000-000000000002'),
  null,
  'switching an already-ticked task to everyone reopens it until every rep ticks'
);

select pg_temp.login_as('00000000-0000-0000-0000-0000000000c1');
select throws_ok(
  $$select public.set_task_done('55555555-0000-0000-0000-000000000001', true)$$,
  '42501', null,
  'a deactivated rep cannot tick anything'
);
select is_empty(
  $$select 1 from public.everyone_task_progress(array['55555555-0000-0000-0000-000000000001'::uuid])$$,
  'a deactivated rep sees no progress'
);

select * from finish();
rollback;
