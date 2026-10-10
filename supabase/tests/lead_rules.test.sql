-- Duplicate protection, stage rules, and the append-only activity log.
begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'rep.a@test.local', '{"full_name":"Rep A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'rep.b@test.local', '{"full_name":"Rep B"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'rep.c@test.local', '{"full_name":"Rep C"}');

create function pg_temp.login_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant all on all tables in schema pg_temp to public;
grant all on all sequences in schema pg_temp to public;

-------------------------------------------------------------------------------
-- Normalization
-------------------------------------------------------------------------------
select is(public.normalize_phone('+1 (301) 555-0100'), '3015550100', 'phone: strips formatting and leading 1');
select is(public.normalize_phone('555-0100'), null, 'phone: too short is invalid');
select is(public.normalize_business_name('  Joe''s Pizza, L.L.C. '), 'joes pizza', 'name: punctuation and LLC removed');
select is(public.normalize_business_name('Smith & Sons Co. Inc'), 'smith and sons', 'name: & and stacked suffixes');
select is(public.normalize_business_name('Costco'), 'costco', 'name: suffix only stripped as a whole word');
select is(public.normalize_business_name('Smith-Jones Roofing'), 'smith jones roofing', 'name: hyphen becomes a space');
select is(public.normalize_business_name('A/C Pros LTD'), 'a c pros', 'name: slash becomes a space, LTD stripped');

-------------------------------------------------------------------------------
-- Duplicates
-------------------------------------------------------------------------------
insert into public.leads (id, business_name, phone, city, owner_id) values
  ('22222222-2222-2222-2222-222222222222', 'Joe''s Pizza LLC', '(301) 555-0100', 'Frederick', '00000000-0000-0000-0000-0000000000a1');

select is(
  (select phone from public.leads where id = '22222222-2222-2222-2222-222222222222'),
  '3015550100',
  'phone is stored as 10 digits'
);

select throws_ok(
  $$insert into public.leads (business_name, phone) values ('Other Biz', '1-301-555-0100')$$,
  '23505', null,
  'same phone in a different format is a duplicate'
);

select throws_ok(
  $$insert into public.leads (business_name, city) values ('JOES PIZZA', ' frederick ')$$,
  '23505', null,
  'same business name + city is a duplicate'
);

select lives_ok(
  $$insert into public.leads (business_name, city) values ('Joe''s Pizza', 'Hagerstown')$$,
  'same business name in another city is fine'
);

select throws_ok(
  $$insert into public.leads (business_name, phone) values ('Bad Phone', '555-0100')$$,
  '22023', null,
  'invalid phone numbers are rejected'
);

select is(
  public.check_duplicate('3015550100', 'x', 'y'), 'phone', 'check_duplicate: phone'
);
select is(
  public.check_duplicate(null, 'Joes Pizza Inc.', 'FREDERICK'), 'name_city', 'check_duplicate: name + city'
);
select is(
  public.check_duplicate('3015550100', 'Joe''s Pizza', 'Frederick', '22222222-2222-2222-2222-222222222222'),
  null,
  'check_duplicate ignores the lead being edited'
);

-------------------------------------------------------------------------------
-- Stage rules (as the owning rep)
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');

select throws_ok(
  $$update public.leads set stage = 'lost' where id = '22222222-2222-2222-2222-222222222222'$$,
  '23514', null,
  'Lost requires a reason'
);

select throws_ok(
  $$update public.leads set stage = 'won' where id = '22222222-2222-2222-2222-222222222222'$$,
  '23514', null,
  'Won requires a deal value'
);

update public.leads set stage = 'won', deal_value = 2500
  where id = '22222222-2222-2222-2222-222222222222';

select is(
  (select won_date from public.leads where id = '22222222-2222-2222-2222-222222222222'),
  public.today_ny(),
  'moving to Won sets the won date'
);

select results_eq(
  $$select type::text, body, user_id from public.activities
    where lead_id = '22222222-2222-2222-2222-222222222222'$$,
  $$values ('stage_change', 'New → Won ($2500.00)', '00000000-0000-0000-0000-0000000000a1'::uuid)$$,
  'stage change is logged automatically, by the rep who made it'
);

update public.leads set won_date = '2020-01-01'
  where id = '22222222-2222-2222-2222-222222222222';
select is(
  (select won_date from public.leads where id = '22222222-2222-2222-2222-222222222222'),
  public.today_ny(),
  'reps cannot change the won date'
);

update public.leads set stage = 'contacted'
  where id = '22222222-2222-2222-2222-222222222222';
select is(
  (select won_date from public.leads where id = '22222222-2222-2222-2222-222222222222'),
  null,
  'leaving Won clears the won date'
);

-------------------------------------------------------------------------------
-- Activities are append-only, even for the database owner.
-------------------------------------------------------------------------------
reset role;
select throws_ok(
  $$update public.activities set body = 'edited'$$,
  '42501', 'Activities are append-only',
  'activities cannot be edited'
);

-------------------------------------------------------------------------------
-- Round robin picks the rep who waited longest. Reps can't call it.
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok('select public.next_round_robin_rep()', '42501', null, 'reps cannot run round robin');
reset role;
select set_config('request.jwt.claims', '', true);  -- back to a server-side caller

-- Ignore any reps that already exist in this database.
update public.profiles set active = false
  where id not in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1');
update public.profiles set last_assigned_at = now() - interval '1 hour'
  where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set last_assigned_at = now() - interval '2 hours'
  where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set last_assigned_at = now(), active = false
  where id = '00000000-0000-0000-0000-0000000000c1';

select results_eq(
  $$select public.next_round_robin_rep() union all select public.next_round_robin_rep()
    union all select public.next_round_robin_rep()$$,
  $$values ('00000000-0000-0000-0000-0000000000b1'::uuid),
           ('00000000-0000-0000-0000-0000000000a1'::uuid),
           ('00000000-0000-0000-0000-0000000000b1'::uuid)$$,
  'round robin rotates through active reps only'
);

select * from finish();
rollback;
