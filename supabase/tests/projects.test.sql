-- Projects and their checklists: only the admin delegates and edits;
-- the assignee sees their own projects and ticks items off.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'rep.a@test.local', '{"full_name":"Rep A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'rep.b@test.local', '{"full_name":"Rep B"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';

create function pg_temp.login_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant all on all tables in schema pg_temp to public;
grant all on all sequences in schema pg_temp to public;

-------------------------------------------------------------------------------
-- Admin creates and delegates
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

select lives_ok(
  $$insert into public.projects (id, name, assignee_id) values
      ('44444444-0000-0000-0000-0000000000a1', '  Build Joe''s site ', '00000000-0000-0000-0000-0000000000a1'),
      ('44444444-0000-0000-0000-0000000000b1', 'Rep B project', '00000000-0000-0000-0000-0000000000b1')$$,
  'admin can create projects for reps'
);
select is(
  (select name from public.projects where id = '44444444-0000-0000-0000-0000000000a1'),
  'Build Joe''s site',
  'project names are trimmed'
);
select is(
  (select created_by from public.projects where id = '44444444-0000-0000-0000-0000000000a1'),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'created_by defaults to the admin'
);
select lives_ok(
  $$insert into public.project_tasks (project_id, title, position) values
      ('44444444-0000-0000-0000-0000000000a1', 'Get logo', 0),
      ('44444444-0000-0000-0000-0000000000a1', 'Write copy', 1),
      ('44444444-0000-0000-0000-0000000000b1', 'B task', 0)$$,
  'admin can add checklist items'
);
select throws_ok(
  $$insert into public.projects (name) values ('   ')$$,
  '23514', null,
  'a project needs a name'
);

-------------------------------------------------------------------------------
-- Rep A: sees only their project, can tick but not edit
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');

select results_eq(
  $$select id from public.projects$$,
  $$values ('44444444-0000-0000-0000-0000000000a1'::uuid)$$,
  'rep sees only projects assigned to them'
);
select results_eq(
  $$select title from public.project_tasks order by position$$,
  $$values ('Get logo'), ('Write copy')$$,
  'rep sees only checklist items on their projects'
);

update public.project_tasks set done = true where title = 'Get logo';
select results_eq(
  $$select done, done_by, done_at is not null from public.project_tasks where title = 'Get logo'$$,
  $$values (true, '00000000-0000-0000-0000-0000000000a1'::uuid, true)$$,
  'rep can tick an item, and who/when is recorded'
);

update public.project_tasks set done = false where title = 'Get logo';
select results_eq(
  $$select done, done_by, done_at from public.project_tasks where title = 'Get logo'$$,
  $$values (false, null::uuid, null::timestamptz)$$,
  'unticking clears who/when'
);

select throws_ok(
  $$update public.project_tasks set title = 'Renamed' where title = 'Write copy'$$,
  '42501', 'Only an admin can edit checklist items',
  'rep cannot rename items'
);
select throws_ok(
  $$insert into public.project_tasks (project_id, title) values ('44444444-0000-0000-0000-0000000000a1', 'Sneaky')$$,
  '42501', null,
  'rep cannot add items'
);

delete from public.project_tasks where title = 'Write copy';
update public.projects set name = 'Hacked', assignee_id = '00000000-0000-0000-0000-0000000000b1';
delete from public.projects;
select throws_ok(
  $$insert into public.projects (name, assignee_id) values ('Mine', '00000000-0000-0000-0000-0000000000a1')$$,
  '42501', null,
  'rep cannot create projects'
);

update public.project_tasks set done = true where title = 'B task';

-------------------------------------------------------------------------------
-- Back to admin to check nothing above went through
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

select is(
  (select count(*)::int from public.project_tasks where title = 'Write copy'),
  1,
  'rep cannot delete items'
);
select results_eq(
  $$select name, assignee_id from public.projects where id = '44444444-0000-0000-0000-0000000000a1'$$,
  $$values ('Build Joe''s site', '00000000-0000-0000-0000-0000000000a1'::uuid)$$,
  'rep cannot rename or reassign a project'
);
select is(
  (select count(*)::int from public.projects),
  2,
  'rep cannot delete projects'
);
select is(
  (select done from public.project_tasks where title = 'B task'),
  false,
  'rep cannot tick items on someone else''s project'
);

select lives_ok(
  $$update public.projects set assignee_id = '00000000-0000-0000-0000-0000000000b1'
    where id = '44444444-0000-0000-0000-0000000000a1'$$,
  'admin can reassign a project'
);

-------------------------------------------------------------------------------
-- Deactivated or logged-out users see nothing
-------------------------------------------------------------------------------
update public.profiles set active = false where id = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.login_as('00000000-0000-0000-0000-0000000000b1');
select is_empty($$select 1 from public.projects$$, 'a deactivated rep sees no projects');

reset role;
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$delete from public.projects where id = '44444444-0000-0000-0000-0000000000a1'$$,
  'admin can delete a project'
);
select is(
  (select count(*)::int from public.project_tasks where project_id = '44444444-0000-0000-0000-0000000000a1'),
  0,
  'deleting a project deletes its checklist'
);

select * from finish();
rollback;
