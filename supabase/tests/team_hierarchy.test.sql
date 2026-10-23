-- Team hierarchy: admins set titles and who reports to whom, loops are
-- blocked, and everyone can read the chart through team_members.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

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
-- Admin sets titles and managers
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

select lives_ok(
  $$update public.profiles set title = '  Head   of Sales ', reports_to = '00000000-0000-0000-0000-00000000000a'
    where id = '00000000-0000-0000-0000-0000000000a1'$$,
  'admin can set a title and who someone reports to'
);
select is(
  (select title from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'Head of Sales',
  'titles are trimmed and extra spaces collapsed'
);
select lives_ok(
  $$update public.profiles set reports_to = '00000000-0000-0000-0000-0000000000a1'
    where id = '00000000-0000-0000-0000-0000000000b1'$$,
  'chains can go more than one level deep'
);
select is(
  (select title from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'),
  null,
  'no title stays empty'
);
select lives_ok(
  $$update public.profiles set title = '   ' where id = '00000000-0000-0000-0000-0000000000b1'$$,
  'a blank title is allowed'
);
select is(
  (select title from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'),
  null,
  'a blank title is saved as none'
);
select throws_ok(
  $$update public.profiles set title = repeat('x', 61) where id = '00000000-0000-0000-0000-0000000000b1'$$,
  '23514', null,
  'titles are 60 characters at most'
);
select throws_ok(
  $$update public.profiles set reports_to = id where id = '00000000-0000-0000-0000-0000000000b1'$$,
  '23514', null,
  'nobody reports to themselves'
);
select throws_ok(
  $$update public.profiles set reports_to = '00000000-0000-0000-0000-0000000000b1'
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  '23514', null,
  'the chain cannot loop back around (Admin -> Rep B -> Rep A -> Admin)'
);

-------------------------------------------------------------------------------
-- Reps can read the chart but not change it
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000b1');

select results_eq(
  $$select full_name, title, reports_to from public.team_members order by full_name$$,
  $$values ('Admin', null::text, null::uuid),
           ('Rep A', 'Head of Sales', '00000000-0000-0000-0000-00000000000a'::uuid),
           ('Rep B', null, '00000000-0000-0000-0000-0000000000a1'::uuid)$$,
  'reps see everyone''s name, title and manager'
);

update public.profiles set reports_to = null, title = 'Boss' where id = '00000000-0000-0000-0000-0000000000b1';
reset role;
select is(
  (select reports_to from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'reps cannot change who they report to'
);
select is(
  (select title from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'),
  null,
  'reps cannot give themselves a title'
);

-------------------------------------------------------------------------------
-- Removing a manager leaves their reports at the top
-------------------------------------------------------------------------------
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
select is(
  (select reports_to from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'),
  null,
  'when a manager is deleted, the people under them report to no one'
);

select * from finish();
rollback;
