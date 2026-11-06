-- Editing history entries: reps fix their own notes, admins fix any note, and
-- nobody rewrites stage changes or moves an entry somewhere else.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'rep.a@test.local', '{"full_name":"Rep A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'rep.b@test.local', '{"full_name":"Rep B"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';

insert into public.leads (id, business_name, phone, city, owner_id) values
  ('33333333-3333-3333-3333-3333333333a1', 'Pgtap Edit Alpha', '999-555-0301', 'Frederick', '00000000-0000-0000-0000-0000000000a1'),
  ('33333333-3333-3333-3333-3333333333b1', 'Pgtap Edit Bravo', '999-555-0302', 'Frederick', '00000000-0000-0000-0000-0000000000b1');

insert into public.activities (id, lead_id, user_id, type, body, created_at) overriding system value values
  (9001, '33333333-3333-3333-3333-3333333333a1', '00000000-0000-0000-0000-0000000000a1', 'note', 'A typo', '2026-11-01 12:00+00'),
  (9002, '33333333-3333-3333-3333-3333333333a1', '00000000-0000-0000-0000-00000000000a', 'note', 'Admin note', '2026-11-01 12:00+00'),
  (9003, '33333333-3333-3333-3333-3333333333b1', '00000000-0000-0000-0000-0000000000b1', 'note', 'B''s note', '2026-11-01 12:00+00'),
  (9004, '33333333-3333-3333-3333-3333333333a1', '00000000-0000-0000-0000-0000000000a1', 'call', null, '2026-11-01 12:00+00'),
  (9005, '33333333-3333-3333-3333-3333333333a1', '00000000-0000-0000-0000-0000000000a1', 'stage_change', 'New → Contacted', '2026-11-01 12:00+00');

create function pg_temp.login_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant all on all tables in schema pg_temp to public;
grant all on all sequences in schema pg_temp to public;

-------------------------------------------------------------------------------
-- Rep A
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');

update public.activities set body = 'Fixed' where id = 9001;
select results_eq(
  'select body, edited_at is not null, created_at from public.activities where id = 9001',
  $$values ('Fixed', true, '2026-11-01 12:00+00'::timestamptz)$$,
  'rep A can edit their own note, it is marked edited, and its time stays put'
);

update public.activities set body = 'Spoke to the owner' where id = 9004;
select is(
  (select body from public.activities where id = 9004),
  'Spoke to the owner',
  'rep A can add details to a call they logged'
);

select throws_ok(
  $$update public.activities set body = '  ' where id = 9001$$,
  '23514', null,
  'a note cannot be emptied'
);

select throws_ok(
  $$update public.activities set type = 'call' where id = 9001$$,
  '42501', 'Only the text of a history entry can be edited',
  'rep A cannot change what kind of entry it is'
);

select throws_ok(
  $$update public.activities set created_at = '2020-01-01' where id = 9001$$,
  '42501', 'Only the text of a history entry can be edited',
  'rep A cannot backdate an entry'
);

select throws_ok(
  $$update public.activities set body = 'Rewritten' where id = 9005$$,
  '42501', 'Stage changes and reassignments can''t be edited',
  'rep A cannot rewrite a stage change they made'
);

update public.activities set body = 'Rewritten' where id in (9002, 9003);

-------------------------------------------------------------------------------
-- Admin
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

update public.activities set body = 'Admin fixed it' where id = 9001;
select is(
  (select body from public.activities where id = 9001),
  'Admin fixed it',
  'admin can edit a rep''s note'
);

select throws_ok(
  $$update public.activities set lead_id = '33333333-3333-3333-3333-3333333333b1' where id = 9002$$,
  '42501', 'Only the text of a history entry can be edited',
  'admin cannot move an entry to another lead'
);

-------------------------------------------------------------------------------
-- After reassignment, rep A can no longer edit notes on that lead.
-------------------------------------------------------------------------------
update public.leads set owner_id = '00000000-0000-0000-0000-0000000000b1'
  where id = '33333333-3333-3333-3333-3333333333a1';

select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');
update public.activities set body = 'Too late' where id = 9001;

-------------------------------------------------------------------------------
-- Check from the test runner what actually changed.
-------------------------------------------------------------------------------
reset role;

select is(
  (select body from public.activities where id = 9002),
  'Admin note',
  'rep A cannot edit someone else''s note on their own lead'
);
select is(
  (select body from public.activities where id = 9003),
  'B''s note',
  'rep A cannot edit rep B''s note'
);
select is(
  (select body from public.activities where id = 9001),
  'Admin fixed it',
  'rep A cannot edit notes on a lead that was reassigned away'
);
select is(
  (select body from public.activities where id = 9005),
  'New → Contacted',
  'the stage change is unchanged'
);
select is(
  (select edited_at from public.activities where id = 9003),
  null,
  'untouched entries are not marked edited'
);

select * from finish();
rollback;
