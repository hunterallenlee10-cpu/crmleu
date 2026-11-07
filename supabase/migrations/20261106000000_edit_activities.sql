-- Let people fix the text of what they logged (calls, texts, emails, meetings,
-- notes) from a lead's history. Only the text can change: who wrote it, when,
-- which lead and what kind stay fixed. Stage changes and reassignments are the
-- audit trail and stay locked, even for an admin.
--
-- Reps can edit their own entries on leads they still own. Admins can edit any
-- of these entries (they could already delete them).

alter table public.activities add column edited_at timestamptz;

-- Replaces the old "append-only" block. The trigger name stays the same.
create or replace function public.activities_block_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.type not in ('call', 'text', 'email', 'meeting', 'note') then
    raise exception 'Stage changes and reassignments can''t be edited' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'body' - 'edited_at') is distinct from (to_jsonb(old) - 'body' - 'edited_at') then
    raise exception 'Only the text of a history entry can be edited' using errcode = '42501';
  end if;
  if new.type = 'note' and nullif(btrim(new.body), '') is null then
    raise exception 'A note can''t be empty' using errcode = '23514';
  end if;

  new.edited_at := now();
  return new;
end;
$$;

create policy "activities: edit own entries"
  on public.activities for update to authenticated
  using (
    (select public.is_admin())
    or (
      user_id = (select auth.uid())
      and (select public.is_active_user())
      and exists (
        select 1 from public.leads l
        where l.id = lead_id and l.owner_id = (select auth.uid())
      )
    )
  )
  with check (
    (select public.is_admin())
    or (
      user_id = (select auth.uid())
      and (select public.is_active_user())
      and exists (
        select 1 from public.leads l
        where l.id = lead_id and l.owner_id = (select auth.uid())
      )
    )
  );
