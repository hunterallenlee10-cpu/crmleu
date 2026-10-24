-- Promotions up for grabs: everyone reads them, only admins add or remove
-- them, and titles are tidied and unique.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

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
-- Admin adds and removes promotions
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$select title from public.promotions order by seq$$,
  $$values ('President'), ('CFO'), ('Sales Manager')$$,
  'the three starting promotions are there, in order'
);
select lives_ok(
  $$insert into public.promotions (title) values ('  Head   of Marketing ')$$,
  'admin can add a promotion'
);
select results_eq(
  $$select title from public.promotions order by seq desc limit 1$$,
  $$values ('Head of Marketing')$$,
  'it goes on the end, trimmed with spaces collapsed'
);
select throws_ok(
  $$insert into public.promotions (title) values ('head of marketing')$$,
  '23505', null,
  'promotions are unique, ignoring case'
);
select throws_ok(
  $$insert into public.promotions (title) values ('   ')$$,
  '23514', null,
  'a promotion needs a title'
);
select throws_ok(
  $$insert into public.promotions (title) values (repeat('x', 61))$$,
  '23514', null,
  'promotions are 60 characters at most'
);
select lives_ok(
  $$delete from public.promotions where title = 'CFO'$$,
  'admin can remove a promotion'
);

-------------------------------------------------------------------------------
-- Rep reads, can't change
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');

select is((select count(*)::int from public.promotions), 3, 'a rep can read the promotions');
select throws_ok(
  $$insert into public.promotions (title) values ('Rep promotion')$$,
  '42501', null,
  'a rep can''t add a promotion'
);
delete from public.promotions;
select is((select count(*)::int from public.promotions), 3, 'a rep can''t remove a promotion');

-------------------------------------------------------------------------------
-- Deactivated users and logged-out visitors
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.promotions), 0, 'a deactivated user sees no promotions');

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok(
  $$select count(*) from public.promotions$$,
  '42501', null,
  'logged-out visitors are refused'
);

select * from finish();
rollback;
