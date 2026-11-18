-- Announcements: everyone on the team reads them, only admins post, edit or delete.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'rep.a@test.local', '{"full_name":"Rep A"}'),
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

-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

select lives_ok(
  $$insert into public.announcements (id, body) values
      ('55555555-0000-0000-0000-000000000001', 'Team call Friday at 10am')$$,
  'admin can post an announcement'
);
select is(
  (select author_id from public.announcements where id = '55555555-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'the author defaults to whoever posted it'
);
select throws_ok(
  $$insert into public.announcements (body) values ('   ')$$,
  '23514', null,
  'blank announcements are rejected'
);

-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');

select results_eq(
  $$select body from public.announcements$$,
  $$values ('Team call Friday at 10am')$$,
  'reps can read announcements'
);
select throws_ok(
  $$insert into public.announcements (body) values ('Free pizza')$$,
  '42501', null,
  'reps cannot post announcements'
);
select is_empty(
  $$update public.announcements set body = 'Changed' returning id$$,
  'reps cannot edit announcements'
);
select is_empty(
  $$delete from public.announcements returning id$$,
  'reps cannot delete announcements'
);

-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000d1');
select is_empty(
  $$select 1 from public.announcements$$,
  'deactivated users cannot read announcements'
);

-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');
select isnt_empty(
  $$delete from public.announcements where id = '55555555-0000-0000-0000-000000000001' returning id$$,
  'admin can delete an announcement'
);

reset role;
set local role anon;
select throws_ok(
  'select * from public.announcements',
  '42501', null,
  'logged-out visitors cannot read announcements'
);

select * from finish();
rollback;
