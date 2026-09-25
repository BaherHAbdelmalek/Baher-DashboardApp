-- Run this once in Supabase: Project > SQL Editor > New query > paste > Run.

create extension if not exists pgcrypto;

-- One row per user: holds a private random token used for the read-only
-- Apple Calendar subscription feed (so the feed URL is unguessable without
-- needing Apple Calendar to send an auth header, which it can't).
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ics_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  project text not null default 'Other',
  urgency text not null default 'soon' check (urgency in ('now','soon','later')), -- kept for history; the UI now uses due_date/priority/flagged instead
  due_date date,
  due_time time,
  priority text not null default 'none' check (priority in ('none','low','medium','high')),
  flagged boolean not null default false,
  notes text,
  subtasks jsonb not null default '[]'::jsonb,
  status text not null default 'todo' check (status in ('todo','done')),
  created_at timestamptz not null default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  project text not null default 'Other',
  date date,
  time time,
  location text,
  status text not null default 'upcoming' check (status in ('upcoming','done')),
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  project text not null default 'Other',
  due_date date,
  due_time time,
  priority text not null default 'none' check (priority in ('none','low','medium','high')),
  flagged boolean not null default false,
  notes text,
  subtasks jsonb not null default '[]'::jsonb,
  status text not null default 'todo' check (status in ('todo','done')),
  notified_on date,
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Row Level Security: every user can only ever see/touch their own rows.
alter table public.user_settings enable row level security;
alter table public.tasks enable row level security;
alter table public.meetings enable row level security;
alter table public.reminders enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "own settings" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own tasks" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own meetings" on public.meetings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own reminders" on public.reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own push subs" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-create the settings row (and ICS token) the moment someone signs up.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Turn on Realtime for the tables the app needs to sync live across devices.
-- (If this errors saying the table's already in the publication, that's fine —
-- it just means it's already on.)
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.meetings;
alter publication supabase_realtime add table public.reminders;
