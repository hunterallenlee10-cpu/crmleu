-- Ventures: everyone reads them, only admins change them, each one carries
-- what it is, who runs it and a timeline, and removing one keeps its tasks.
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'rep.a@test.local', '{"full_name":"Rep A"}'),
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
-- Starting ventures (the old divisions)
-------------------------------------------------------------------------------
select results_eq(
  $$select name from public.ventures order by position$$,
  $$values ('AI Auto'), ('Websites'), ('SEO / Google Rank'), ('Social Media'), ('Consulting'), ('CRM'),
           ('Ecom'), ('BM'), ('Ads'), ('Selling TRW'), ('Crypto'), ('Clothes')$$,
  'the twelve starting ventures are there, in map order'
);
select is(
  (select count(*)::int from public.ventures where status = 'building' and description is null and lead_id is null),
  12,
  'existing ventures start as "building" with no details yet'
);

-------------------------------------------------------------------------------
-- Admin manages ventures
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

select lives_ok(
  $$insert into public.ventures (id, name, position) values
      ('55555555-0000-0000-0000-000000000001', '  Podcasts   Studio ', 12),
      ('55555555-0000-0000-0000-000000000002', 'Events', 13)$$,
  'admin can add ventures'
);
select is(
  (select name from public.ventures where id = '55555555-0000-0000-0000-000000000001'),
  'Podcasts Studio',
  'venture names are trimmed and extra spaces collapsed'
);
select throws_ok(
  $$insert into public.ventures (name) values ('websites')$$,
  '23505', null,
  'venture names are unique, ignoring case'
);
select throws_ok(
  $$insert into public.ventures (name) values ('   ')$$,
  '23514', null,
  'a venture needs a name'
);
select throws_ok(
  $$insert into public.ventures (name) values (repeat('x', 41))$$,
  '23514', null,
  'venture names are 40 characters at most'
);
select lives_ok(
  $$update public.ventures
    set name = 'Podcasts', position = 3,
        description = '  A weekly show about building LEU.  ',
        lead_id = '00000000-0000-0000-0000-0000000000a1',
        status = 'live', start_date = '2026-01-01', target_date = '2026-12-31'
    where id = '55555555-0000-0000-0000-000000000001'$$,
  'admin can fill in what a venture is, who runs it and its timeline'
);
select results_eq(
  $$select description, lead_id, status, start_date, target_date from public.ventures
    where id = '55555555-0000-0000-0000-000000000001'$$,
  $$values ('A weekly show about building LEU.', '00000000-0000-0000-0000-0000000000a1'::uuid, 'live',
            '2026-01-01'::date, '2026-12-31'::date)$$,
  'the details are saved, with the description trimmed'
);
update public.ventures set description = '   ' where id = '55555555-0000-0000-0000-000000000001';
select is(
  (select description from public.ventures where id = '55555555-0000-0000-0000-000000000001'),
  null,
  'a blank description is stored as empty'
);
select throws_ok(
  $$update public.ventures set status = 'dead' where id = '55555555-0000-0000-0000-000000000001'$$,
  '23514', null,
  'the status must be one of idea, building, live, paused'
);
select throws_ok(
  $$update public.ventures set start_date = '2027-01-01' where id = '55555555-0000-0000-0000-000000000001'$$,
  '23514', null,
  'the target date can''t be before the start date'
);
select throws_ok(
  $$update public.ventures set description = repeat('x', 2001) where id = '55555555-0000-0000-0000-000000000001'$$,
  '23514', null,
  'descriptions are 2,000 characters at most'
);

-------------------------------------------------------------------------------
-- Tasks on a venture
-------------------------------------------------------------------------------
select lives_ok(
  $$insert into public.tasks (id, title, assignee_id, venture_id) values
      ('66666666-0000-0000-0000-000000000001', 'Record episode 1', '00000000-0000-0000-0000-0000000000a1',
       '55555555-0000-0000-0000-000000000001'),
      ('66666666-0000-0000-0000-000000000002', 'Book a guest', null, '55555555-0000-0000-0000-000000000001')$$,
  'admin can add tasks to a venture'
);
select throws_ok(
  $$insert into public.tasks (title, venture_id) values ('Nowhere', '55555555-0000-0000-0000-0000000000ff')$$,
  '23503', null,
  'a task can''t point at a venture that doesn''t exist'
);
select lives_ok(
  $$delete from public.ventures where id = '55555555-0000-0000-0000-000000000002'$$,
  'admin can remove an empty venture'
);
select lives_ok(
  $$delete from public.ventures where id = '55555555-0000-0000-0000-000000000001'$$,
  'admin can remove a venture that has tasks'
);
select results_eq(
  $$select count(*)::int, count(venture_id)::int from public.tasks
    where id in ('66666666-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000002')$$,
  $$values (2, 0)$$,
  'its tasks stay on the task list, without a venture'
);

-- Archived projects don't block removing a venture either.
insert into public.ventures (id, name, position) values ('55555555-0000-0000-0000-000000000003', 'Archive test', 14);
insert into public.projects (id, name, division_id) values
  ('44444444-0000-0000-0000-0000000000a1', 'Old project', '55555555-0000-0000-0000-000000000003');
select lives_ok(
  $$delete from public.ventures where id = '55555555-0000-0000-0000-000000000003'$$,
  'a venture that archived projects pointed at can be removed'
);

insert into public.tasks (id, title, assignee_id, venture_id) values
  ('66666666-0000-0000-0000-000000000003', 'Write the site copy', '00000000-0000-0000-0000-0000000000a1',
   (select id from public.ventures where name = 'Websites'));

-------------------------------------------------------------------------------
-- Rep: reads ventures, can't change them or move tasks between them
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');

select is(
  (select count(*)::int from public.ventures),
  12,
  'a rep can read every venture'
);
select is(
  (select count(*)::int from public.tasks where venture_id is not null),
  1,
  'a rep can see the tasks on each venture'
);

select throws_ok(
  $$insert into public.ventures (name) values ('Rep venture')$$,
  '42501', null,
  'a rep can''t add a venture'
);

update public.ventures set name = 'Hacked', description = 'Hacked', lead_id = auth.uid() where name = 'Ads';
delete from public.ventures where name = 'Crypto';
select results_eq(
  $$select count(*)::int from public.ventures where name in ('Ads', 'Crypto') and description is null$$,
  $$values (2)$$,
  'a rep can''t edit or remove a venture'
);

update public.tasks set venture_id = (select id from public.ventures where name = 'Ads')
  where id = '66666666-0000-0000-0000-000000000003';
select is(
  (select v.name from public.tasks t join public.ventures v on v.id = t.venture_id
   where t.id = '66666666-0000-0000-0000-000000000003'),
  'Websites',
  'a rep can''t move their task to another venture'
);

select lives_ok(
  $$select public.set_task_done('66666666-0000-0000-0000-000000000003', true)$$,
  'a rep can still tick off their task on a venture'
);

-------------------------------------------------------------------------------
-- Deactivated users and logged-out visitors
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000c1');
select is(
  (select count(*)::int from public.ventures),
  0,
  'a deactivated user sees no ventures'
);

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok(
  $$select count(*) from public.ventures$$,
  '42501', null,
  'logged-out visitors are refused'
);

select * from finish();
rollback;
