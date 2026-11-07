-- Venture co-leads: everyone sees them, only admins change them, a venture
-- has at most two, and its lead can't also be a co-lead.
begin;
create extension if not exists pgtap with schema extensions;

select plan(19);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'rep.a@test.local', '{"full_name":"Rep A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'rep.b@test.local', '{"full_name":"Rep B"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'rep.b2@test.local', '{"full_name":"Rep B2"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'rep.c@test.local', '{"full_name":"Rep C"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set active = false where id = '00000000-0000-0000-0000-0000000000c1';

create function pg_temp.login_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.co_leads(p_venture text) returns uuid[] language sql as $$
  select coalesce(array_agg(c.user_id order by c.user_id), '{}')
  from public.venture_co_leads c join public.ventures v on v.id = c.venture_id
  where v.name = p_venture
$$;
grant all on all tables in schema pg_temp to public;
grant all on all sequences in schema pg_temp to public;
grant execute on all functions in schema pg_temp to public;

-------------------------------------------------------------------------------
-- Admin picks a lead and co-leads
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

select is(
  (select count(*)::int from public.venture_co_leads),
  0,
  'ventures start with no co-leads'
);

update public.ventures set lead_id = '00000000-0000-0000-0000-0000000000a1' where name = 'Websites';

select lives_ok(
  $$insert into public.venture_co_leads (venture_id, user_id)
    select id, unnest(array['00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2']::uuid[])
    from public.ventures where name = 'Websites'$$,
  'admin can add two co-leads'
);
select throws_ok(
  $$insert into public.venture_co_leads (venture_id, user_id)
    select id, '00000000-0000-0000-0000-00000000000a' from public.ventures where name = 'Websites'$$,
  '23514', 'A venture can have up to 2 co-leads.',
  'a venture can''t have a third co-lead'
);
select throws_ok(
  $$insert into public.venture_co_leads (venture_id, user_id)
    select id, '00000000-0000-0000-0000-0000000000a1'::uuid from public.ventures where name = 'Ads'
    union all select id, '00000000-0000-0000-0000-0000000000a1'::uuid from public.ventures where name = 'Ads'$$,
  '23505', null,
  'someone can only co-lead a venture once'
);
update public.ventures set lead_id = '00000000-0000-0000-0000-0000000000a1' where name = 'Ads';
select throws_ok(
  $$insert into public.venture_co_leads (venture_id, user_id)
    select id, '00000000-0000-0000-0000-0000000000a1' from public.ventures where name = 'Ads'$$,
  '23514', 'They already lead this venture.',
  'the lead can''t also be a co-lead'
);

update public.ventures set lead_id = '00000000-0000-0000-0000-0000000000b1' where name = 'Websites';
select is(
  pg_temp.co_leads('Websites'),
  array['00000000-0000-0000-0000-0000000000b2']::uuid[],
  'a co-lead who becomes the lead comes off the co-lead list'
);

select lives_ok(
  $$select public.set_venture_co_leads(
      (select id from public.ventures where name = 'Websites'),
      array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a']::uuid[])$$,
  'admin can replace the co-lead list in one go'
);
select is(
  pg_temp.co_leads('Websites'),
  array['00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1']::uuid[],
  'the new list replaces the old one'
);
select throws_ok(
  $$select public.set_venture_co_leads(
      (select id from public.ventures where name = 'Websites'),
      array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2',
            '00000000-0000-0000-0000-00000000000a']::uuid[])$$,
  '23514', null,
  'replacing the list can''t go over two co-leads'
);
select is(
  pg_temp.co_leads('Websites'),
  array['00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1']::uuid[],
  'a refused save leaves the list as it was'
);
select lives_ok(
  $$select public.set_venture_co_leads((select id from public.ventures where name = 'Websites'), '{}')$$,
  'admin can clear the co-leads'
);
select is(pg_temp.co_leads('Websites'), '{}'::uuid[], 'an empty list removes them all');

insert into public.venture_co_leads (venture_id, user_id)
  select id, '00000000-0000-0000-0000-0000000000b2' from public.ventures where name = 'Crypto';

-------------------------------------------------------------------------------
-- Rep: reads co-leads, can't change them
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-0000000000a1');

select is(
  pg_temp.co_leads('Crypto'),
  array['00000000-0000-0000-0000-0000000000b2']::uuid[],
  'a rep can see who co-leads a venture'
);
select throws_ok(
  $$insert into public.venture_co_leads (venture_id, user_id)
    select id, auth.uid() from public.ventures where name = 'Clothes'$$,
  '42501', null,
  'a rep can''t make themselves a co-lead'
);
delete from public.venture_co_leads;
select is(
  pg_temp.co_leads('Crypto'),
  array['00000000-0000-0000-0000-0000000000b2']::uuid[],
  'a rep can''t remove a co-lead'
);
select throws_ok(
  $$select public.set_venture_co_leads((select id from public.ventures where name = 'Crypto'), array[auth.uid()])$$,
  '42501', null,
  'a rep can''t replace the co-lead list either'
);

-------------------------------------------------------------------------------
-- Removing a venture, deactivated users and logged-out visitors
-------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-00000000000a');
delete from public.ventures where name = 'Crypto';
select is(
  (select count(*)::int from public.venture_co_leads where user_id = '00000000-0000-0000-0000-0000000000b2'),
  0,
  'removing a venture removes its co-leads'
);

insert into public.venture_co_leads (venture_id, user_id)
  select id, '00000000-0000-0000-0000-0000000000b2' from public.ventures where name = 'Clothes';
select pg_temp.login_as('00000000-0000-0000-0000-0000000000c1');
select is(
  (select count(*)::int from public.venture_co_leads),
  0,
  'a deactivated user sees no co-leads'
);

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok(
  $$select count(*) from public.venture_co_leads$$,
  '42501', null,
  'logged-out visitors are refused'
);

select * from finish();
rollback;
