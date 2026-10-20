-- Divisions: everyone reads them, only admins change them, and a division
-- can't be removed while a project still belongs to it.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

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
-- Starting divisions
-------------------------------------------------------------------------------
select results_eq(
  $$select name from public.project_divisions order by position$$,
  $$values ('AI Auto'), ('Websites'), ('SEO / Google Rank'), ('Social Media'), ('Consulting'), ('CRM'),
           ('Ecom'), ('BM'), ('Ads'), ('Selling TRW'), ('Crypto'), ('Clothes')$$,
  'the twelve starting divisions are there, in map order'
);

-------------------------------------------------------------------------------
-- Admin manages divisions
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

select lives_ok(
  $$insert into public.project_divisions (id, name, position) values
      ('55555555-0000-0000-0000-000000000001', '  Podcasts   Studio ', 12),
      ('55555555-0000-0000-0000-000000000002', 'Events', 13)$$,
  'admin can add divisions'
);
select is(
  (select name from public.project_divisions where id = '55555555-0000-0000-0000-000000000001'),
  'Podcasts Studio',
  'division names are trimmed and extra spaces collapsed'
);
select throws_ok(
  $$insert into public.project_divisions (name) values ('websites')$$,
  '23505', null,
  'division names are unique, ignoring case'
);
select throws_ok(
  $$insert into public.project_divisions (name) values ('   ')$$,
  '23514', null,
  'a division needs a name'
);
select throws_ok(
  $$insert into public.project_divisions (name) values (repeat('x', 41))$$,
  '23514', null,
  'division names are 40 characters at most'
);
select lives_ok(
  $$update public.project_divisions set name = 'Podcasts', position = 3
    where id = '55555555-0000-0000-0000-000000000001'$$,
  'admin can rename and move a division'
);

insert into public.projects (id, name, assignee_id, division_id) values
  ('44444444-0000-0000-0000-0000000000a1', 'Launch podcast', '00000000-0000-0000-0000-0000000000a1',
   '55555555-0000-0000-0000-000000000001');

select throws_ok(
  $$delete from public.project_divisions where id = '55555555-0000-0000-0000-000000000001'$$,
  '23503', null,
  'a division with projects can''t be removed'
);
select lives_ok(
  $$delete from public.project_divisions where id = '55555555-0000-0000-0000-000000000002'$$,
  'admin can remove an empty division'
);
select lives_ok(
  $$update public.projects set division_id = (select id from public.project_divisions where name = 'Websites')
    where id = '44444444-0000-0000-0000-0000000000a1'$$,
  'admin can move a project to another division'
);
select lives_ok(
  $$delete from public.project_divisions where id = '55555555-0000-0000-0000-000000000001'$$,
  'once its projects have moved, the division can be removed'
);

-------------------------------------------------------------------------------
-- Rep: reads divisions, can't change them or move projects
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');

select is(
  (select count(*)::int from public.project_divisions),
  12,
  'a rep can read every division'
);

select throws_ok(
  $$insert into public.project_divisions (name) values ('Rep division')$$,
  '42501', null,
  'a rep can''t add a division'
);

update public.project_divisions set name = 'Hacked' where name = 'Ads';
delete from public.project_divisions where name = 'Crypto';
select results_eq(
  $$select count(*)::int from public.project_divisions where name in ('Ads', 'Crypto')$$,
  $$values (2)$$,
  'a rep can''t rename or remove a division'
);

update public.projects set division_id = (select id from public.project_divisions where name = 'Ads')
  where id = '44444444-0000-0000-0000-0000000000a1';
select is(
  (select d.name from public.projects p join public.project_divisions d on d.id = p.division_id
   where p.id = '44444444-0000-0000-0000-0000000000a1'),
  'Websites',
  'a rep can''t move their project to another division'
);

-------------------------------------------------------------------------------
-- Deactivated users and logged-out visitors
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000c1');
select is(
  (select count(*)::int from public.project_divisions),
  0,
  'a deactivated user sees no divisions'
);

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok(
  $$select count(*) from public.project_divisions$$,
  '42501', null,
  'logged-out visitors are refused'
);

select * from finish();
rollback;
