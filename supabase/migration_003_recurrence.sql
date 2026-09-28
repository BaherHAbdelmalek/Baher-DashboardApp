-- Repeating tasks, reminders and meetings.
--
-- Run this in Supabase (SQL Editor → New query) if you already deployed an
-- earlier version. Purely additive — it only adds one nullable column per
-- table, so no existing data is touched.
--
-- The rule is stored as JSON rather than spread across half a dozen columns
-- because nothing on the server queries its internals; the app reads the whole
-- rule or none of it. Shape (see src/lib/recurrence.js):
--
--   {
--     "freq":     "day" | "week" | "month" | "year",
--     "interval": 1,
--     "weekdays": [1,3,5],                  -- freq "week"; 0 = Sunday
--     "monthMode":"date" | "weekday",       -- freq "month"
--     "from":     "due" | "completion",
--     "ends":     { "type": "never" }
--               | { "type": "on", "date": "2026-12-31" }
--               | { "type": "after", "count": 10 },
--     "done":     0                          -- occurrences completed so far
--   }
--
-- NULL means "does not repeat".

alter table public.tasks     add column if not exists repeat_rule jsonb;
alter table public.reminders add column if not exists repeat_rule jsonb;
alter table public.meetings  add column if not exists repeat_rule jsonb;

-- Reject anything that isn't a JSON object, so a malformed write can't wedge
-- the client. Everything beyond that is validated in the app, which has to be
-- tolerant of older rows anyway.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_repeat_rule_is_object') then
    alter table public.tasks
      add constraint tasks_repeat_rule_is_object
      check (repeat_rule is null or jsonb_typeof(repeat_rule) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reminders_repeat_rule_is_object') then
    alter table public.reminders
      add constraint reminders_repeat_rule_is_object
      check (repeat_rule is null or jsonb_typeof(repeat_rule) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'meetings_repeat_rule_is_object') then
    alter table public.meetings
      add constraint meetings_repeat_rule_is_object
      check (repeat_rule is null or jsonb_typeof(repeat_rule) = 'object');
  end if;
end $$;

-- Helps the "Repeating" smart list and the calendar feed skip the (usually
-- large) majority of rows that don't repeat.
create index if not exists tasks_repeat_rule_idx     on public.tasks     (user_id) where repeat_rule is not null;
create index if not exists reminders_repeat_rule_idx on public.reminders (user_id) where repeat_rule is not null;
create index if not exists meetings_repeat_rule_idx  on public.meetings  (user_id) where repeat_rule is not null;

-- ---------------------------------------------------------------------------
-- Per-user timezone, so notifications fire on the user's clock.
--
-- Meetings and reminders are stored as bare date + time with no offset. The
-- notification job runs in UTC, so without this it computed "30 minutes before
-- your 9am meeting" against UTC 9am — off by the user's whole UTC offset — and
-- decided "due today" using the UTC date, which is the wrong day for part of
-- every day almost everywhere. The app fills this in from the browser
-- (Intl.DateTimeFormat().resolvedOptions().timeZone) on each sign-in.
-- ---------------------------------------------------------------------------

alter table public.user_settings add column if not exists timezone text;
