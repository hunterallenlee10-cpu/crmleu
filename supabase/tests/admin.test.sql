-- Dashboard numbers and the bulk duplicate check used by CSV import.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

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

insert into public.leads (id, business_name, phone, city, owner_id, stage, deal_value, won_date) values
  ('33333333-0000-0000-0000-000000000001', 'Pgtap Won One',  '9995551001', 'Testville', '00000000-0000-0000-0000-0000000000a1', 'won', 1000, public.today_ny()),
  ('33333333-0000-0000-0000-000000000002', 'Pgtap Won Two',  '9995551002', 'Testville', '00000000-0000-0000-0000-0000000000a1', 'won', 500,  public.today_ny()),
  ('33333333-0000-0000-0000-000000000003', 'Pgtap Old Win',  '9995551003', 'Testville', '00000000-0000-0000-0000-0000000000a1', 'won', 999,
     date_trunc('month', public.today_ny())::date - 1),
  ('33333333-0000-0000-0000-000000000004', 'Pgtap B Win',    '9995551004', 'Testville', '00000000-0000-0000-0000-0000000000b1', 'won', 2000, public.today_ny()),
  ('33333333-0000-0000-0000-000000000005', 'Pgtap Open One', '9995551005', 'Testville', '00000000-0000-0000-0000-0000000000a1', 'contacted', null, null);

insert into public.activities (lead_id, user_id, type, created_at) values
  ('33333333-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', 'call', now()),
  ('33333333-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', 'call', now()),
  ('33333333-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', 'call', now() - interval '8 days');

-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$select deals::int, revenue from public.dashboard_won_this_month()
    where owner_id = '00000000-0000-0000-0000-0000000000a1'$$,
  $$values (2, 1500.00::numeric)$$,
  'won this month counts only this month''s wins for rep A'
);
select results_eq(
  $$select deals::int, revenue from public.dashboard_won_this_month()
    where owner_id = '00000000-0000-0000-0000-0000000000b1'$$,
  $$values (1, 2000.00::numeric)$$,
  'won this month for rep B'
);
select results_eq(
  $$select lead_count::int from public.dashboard_stage_counts()
    where owner_id = '00000000-0000-0000-0000-0000000000a1' and stage = 'won'$$,
  $$values (3)$$,
  'stage counts per rep'
);
select results_eq(
  $$select activity_count::int from public.dashboard_activity_counts()
    where user_id = '00000000-0000-0000-0000-0000000000a1' and type = 'call'$$,
  $$values (2)$$,
  'activities this week ignore last week'
);

select results_eq(
  $$select idx, reason from public.check_duplicates_bulk(
      array['(999) 555-1001', null, '9995559876'],
      array['Different Name', 'PGTAP WON TWO, LLC', 'Brand New Biz'],
      array['Elsewhere', 'testville', 'Testville'])
    order by idx$$,
  $$values (0, 'phone'), (1, 'name_city')$$,
  'bulk duplicate check flags phone and name+city matches only'
);

-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');

select results_eq(
  $$select count(*)::int from public.dashboard_won_this_month()$$,
  $$values (1)$$,
  'a rep calling the dashboard only sees their own row'
);
select is_empty(
  $$select 1 from public.dashboard_stage_counts() where owner_id = '00000000-0000-0000-0000-0000000000b1'$$,
  'a rep cannot see other reps'' stage counts'
);
select throws_ok(
  $$select * from public.check_duplicates_bulk(array['1'], array['x'], array['y'])$$,
  '42501', null,
  'reps cannot run the bulk duplicate check'
);

reset role;
set local role anon;
select throws_ok(
  'select * from public.dashboard_won_this_month()',
  '42501', null,
  'logged-out visitors cannot read dashboard numbers'
);

select * from finish();
rollback;
