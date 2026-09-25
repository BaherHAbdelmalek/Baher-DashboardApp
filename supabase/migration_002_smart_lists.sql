-- Run this AFTER schema.sql if you already deployed once. Purely additive —
-- no existing data or columns are touched or dropped.

alter table public.tasks
  add column if not exists due_date date,
  add column if not exists due_time time,
  add column if not exists priority text not null default 'none' check (priority in ('none','low','medium','high')),
  add column if not exists flagged boolean not null default false,
  add column if not exists notes text,
  add column if not exists subtasks jsonb not null default '[]'::jsonb;

alter table public.reminders
  add column if not exists due_time time,
  add column if not exists priority text not null default 'none' check (priority in ('none','low','medium','high')),
  add column if not exists flagged boolean not null default false,
  add column if not exists notes text,
  add column if not exists subtasks jsonb not null default '[]'::jsonb;

-- The old 'urgency' column on tasks is left in place (unused by the new UI)
-- so nothing is lost — you can drop it later once you're sure you don't want it:
--   alter table public.tasks drop column urgency;
