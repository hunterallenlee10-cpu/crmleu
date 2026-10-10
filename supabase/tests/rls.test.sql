-- Proves reps are walled off from each other's leads by the database itself.
-- Run with: npx supabase test db   (or scripts/db-test/run.sh without Docker)
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

-- People: one admin, two reps.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'rep.a@test.local', '{"full_name":"Rep A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'rep.b@test.local', '{"full_name":"Rep B", "role":"admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set commission_rate = 10 where id = '00000000-0000-0000-0000-0000000000a1';

-- Leads: one each.
insert into public.leads (id, business_name, phone, city, owner_id) values
  ('11111111-1111-1111-1111-1111111111a1', 'Alpha Plumbing', '301-555-0001', 'Frederick', '00000000-0000-0000-0000-0000000000a1'),
  ('11111111-1111-1111-1111-1111111111b1', 'Bravo Roofing',  '301-555-0002', 'Frederick', '00000000-0000-0000-0000-0000000000b1');
insert into public.activities (lead_id, user_id, type, body) values
  ('11111111-1111-1111-1111-1111111111a1', '00000000-0000-0000-0000-0000000000a1', 'note', 'A''s note'),
  ('11111111-1111-1111-1111-1111111111b1', '00000000-0000-0000-0000-0000000000b1', 'note', 'B''s secret note');

-- Switch the session to a logged-in user, like a request from the app would.
create function pg_temp.login_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- pgTAP keeps its bookkeeping in temp tables owned by the test runner.
grant all on all tables in schema pg_temp to public;
grant all on all sequences in schema pg_temp to public;

-------------------------------------------------------------------------------
-- Profile trigger
-------------------------------------------------------------------------------
select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'),
  'rep',
  'new users are always reps, even if signup metadata asks for admin'
);

-------------------------------------------------------------------------------
-- Rep A
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');

select results_eq(
  'select id from public.leads',
  $$values ('11111111-1111-1111-1111-1111111111a1'::uuid)$$,
  'rep A sees only their own lead'
);

select is_empty(
  $$select 1 from public.leads where id = '11111111-1111-1111-1111-1111111111b1'$$,
  'rep A cannot read rep B''s lead by id'
);

select is_empty(
  $$select 1 from public.activities where lead_id = '11111111-1111-1111-1111-1111111111b1'$$,
  'rep A cannot read activities on rep B''s lead'
);

select results_eq(
  'select count(*)::int from public.activities',
  'values (1)',
  'rep A sees only activities on their own lead'
);

-- Writes against B's lead silently match zero rows under RLS...
select lives_ok(
  $$update public.leads set contact_name = 'hacked' where id = '11111111-1111-1111-1111-1111111111b1'$$,
  'update of rep B''s lead runs...'
);
select lives_ok(
  $$delete from public.leads where id = '11111111-1111-1111-1111-1111111111b1'$$,
  'delete of rep B''s lead runs...'
);

select throws_ok(
  $$insert into public.activities (lead_id, user_id, type, body)
    values ('11111111-1111-1111-1111-1111111111b1', '00000000-0000-0000-0000-0000000000a1', 'note', 'sneaky')$$,
  '42501', null,
  'rep A cannot log an activity on rep B''s lead'
);

select throws_ok(
  $$insert into public.leads (business_name, owner_id)
    values ('Planted Lead', '00000000-0000-0000-0000-0000000000b1')$$,
  '42501', null,
  'rep A cannot create a lead owned by rep B'
);

select throws_ok(
  $$insert into public.leads (business_name, owner_id, source)
    values ('Fake Import', '00000000-0000-0000-0000-0000000000a1', 'import')$$,
  '42501', null,
  'rep A cannot create a lead with a non-manual source'
);

select throws_ok(
  $$update public.leads set owner_id = '00000000-0000-0000-0000-0000000000b1'
    where id = '11111111-1111-1111-1111-1111111111a1'$$,
  '42501', 'Only an admin can reassign leads',
  'rep A cannot reassign their own lead'
);

select throws_ok(
  $$update public.leads set owner_id = null
    where id = '11111111-1111-1111-1111-1111111111a1'$$,
  '42501', 'Only an admin can reassign leads',
  'rep A cannot unassign their own lead'
);

select lives_ok(
  $$delete from public.leads where id = '11111111-1111-1111-1111-1111111111a1'$$,
  'delete of own lead runs (but should match nothing)...'
);

select lives_ok(
  $$delete from public.activities where lead_id = '11111111-1111-1111-1111-1111111111a1'$$,
  'delete of own activities runs (but should match nothing)...'
);

select lives_ok(
  $$update public.activities set body = 'rewritten' where lead_id = '11111111-1111-1111-1111-1111111111a1'$$,
  'update of own activities runs (but should match nothing)...'
);

select lives_ok(
  $$update public.profiles set commission_rate = 50, role = 'admin'
    where id = '00000000-0000-0000-0000-0000000000a1'$$,
  'self-promotion update runs (but should match nothing)...'
);

select results_eq(
  'select id from public.profiles',
  $$values ('00000000-0000-0000-0000-0000000000a1'::uuid)$$,
  'rep A can read only their own profile'
);

select lives_ok(
  $$update public.leads set contact_name = 'Al', next_follow_up = '2026-11-01'
    where id = '11111111-1111-1111-1111-1111111111a1'$$,
  'rep A can edit their own lead'
);

select lives_ok(
  $$insert into public.activities (lead_id, user_id, type, body)
    values ('11111111-1111-1111-1111-1111111111a1', '00000000-0000-0000-0000-0000000000a1', 'call', 'No answer')$$,
  'rep A can log a call on their own lead'
);

select throws_ok(
  $$insert into public.activities (lead_id, user_id, type, body)
    values ('11111111-1111-1111-1111-1111111111a1', '00000000-0000-0000-0000-0000000000a1', 'stage_change', 'fake')$$,
  '42501', null,
  'rep A cannot hand-write stage change entries'
);

select lives_ok(
  $$insert into public.leads (business_name, owner_id, city)
    values ('Charlie Cleaning', '00000000-0000-0000-0000-0000000000a1', 'Hagerstown')$$,
  'rep A can create a lead for themselves'
);

select is(
  public.check_duplicate('(301) 555-0002', 'Anything', 'Anywhere'),
  'phone',
  'duplicate check says rep B''s phone is taken without revealing the lead'
);

-------------------------------------------------------------------------------
-- Back to the test runner to confirm nothing changed.
-------------------------------------------------------------------------------
reset role;

select is(
  (select contact_name from public.leads where id = '11111111-1111-1111-1111-1111111111b1'),
  null,
  '...and rep B''s lead was not changed'
);
select isnt_empty(
  $$select 1 from public.leads where id = '11111111-1111-1111-1111-1111111111b1'$$,
  '...and rep B''s lead was not deleted'
);
select isnt_empty(
  $$select 1 from public.leads where id = '11111111-1111-1111-1111-1111111111a1'$$,
  '...and rep A could not delete their own lead'
);
select results_eq(
  $$select body from public.activities
    where lead_id = '11111111-1111-1111-1111-1111111111a1' and type = 'note'$$,
  $$values ('A''s note')$$,
  '...and rep A''s activities were neither deleted nor rewritten'
);
select results_eq(
  $$select role::text, commission_rate from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'$$,
  $$values ('rep', 10.00::numeric)$$,
  '...and rep A''s role and commission rate are unchanged'
);

-------------------------------------------------------------------------------
-- Admin can do everything.
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$select count(*)::int from public.leads
    where business_name in ('Alpha Plumbing', 'Bravo Roofing', 'Charlie Cleaning')$$,
  'values (3)',
  'admin sees every rep''s leads'
);

update public.leads set owner_id = '00000000-0000-0000-0000-0000000000b1'
  where id = '11111111-1111-1111-1111-1111111111a1';
select results_eq(
  $$select body from public.activities
    where lead_id = '11111111-1111-1111-1111-1111111111a1' and type = 'reassignment'$$,
  $$values ('Reassigned from Rep A to Rep B')$$,
  'admin can reassign, and it is logged'
);

delete from public.leads where id = '11111111-1111-1111-1111-1111111111b1';
select is_empty(
  $$select 1 from public.leads where id = '11111111-1111-1111-1111-1111111111b1'$$,
  'admin can delete a lead'
);

-------------------------------------------------------------------------------
-- Deactivated reps and logged-out visitors see nothing.
-------------------------------------------------------------------------------
reset role;
update public.profiles set active = false where id = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.login_as('00000000-0000-0000-0000-0000000000b1');
select is_empty('select 1 from public.leads', 'a deactivated rep sees no leads');

reset role;
set local role anon;
select throws_ok('select 1 from public.leads', '42501', null, 'logged-out visitors cannot query leads');

select * from finish();
rollback;
