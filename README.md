# Baher Dashboard — deployable app

A real multi-user web app: tasks, meetings, and reminders, with accounts,
cross-device sync, an Apple Calendar feed, and push notifications. Installable
on your phone and laptop as a PWA (Progressive Web App).

## What this is (and isn't)

This is not a claude.ai artifact — it's an actual project you deploy to real
services. Every piece runs on a free tier:

| Piece | Service | Why |
|---|---|---|
| Hosting + serverless functions | Vercel | Free (Hobby) plan is enough |
| Database + auth + realtime sync | Supabase | Free tier is enough |
| Push notifications | Web Push (VAPID) — no Apple/Google account needed | Standard browser API |
| Frequent notification checks | GitHub Actions (or cron-job.org) | Vercel's free cron only runs once a day — see below |

Nothing here costs money unless your usage grows well beyond personal/family scale.

## What you'll end up with

- **Accounts**: real sign-up/sign-in (email + password), each person's data private to them
- **Sync**: open the app on your phone and laptop signed into the same account — changes appear on both, live
- **Install to home screen**: works like a native app icon on iPhone, Android, and desktop
- **Apple Calendar**: a private subscribable calendar feed URL — add it once in Calendar's settings, and your meetings show up there too (refreshed on Apple's own schedule, not instantly)
- **Push notifications**: a heads-up ~30 minutes before a meeting, and a daily nudge for due/overdue reminders — even when the app isn't open
- **Tasks and Reminders, Apple-Reminders-style**: both sections share the same feature set — due date *and* time, priority (none/low/medium/high), a flag toggle, notes, and subtasks — plus smart-view navigation (All / Today / Scheduled / Flagged / Repeating) instead of a fixed board. Meetings stays separate, matching how Apple splits Reminders from Calendar.
- **Repeating items**: tasks, reminders *and* meetings can repeat — daily, weekdays, weekly, fortnightly, monthly, quarterly, yearly, or a custom rule (every N days/weeks/months/years, specific weekdays, same date vs. same weekday of the month, ending never / on a date / after N times). See [Repeating items](#repeating-items) below.
- **Editable after the fact**: every field on every item can be changed from the item's own detail panel — title, date, time, priority, category, location, repeat, notes, subtasks.
- **Built for phone, iPad and desktop**: a thumb-reachable bottom bar on phones, a two-column layout on wide screens, full-size touch targets, safe-area handling around the notch and home indicator, and automatic dark mode (with a manual light/dark/system override).

## Repeating items

Set **Repeat** when you add something, or open any item's detail panel and
choose an interval. A repeat needs a due date — it's the date the schedule
counts from — so the picker says so if one isn't set yet.

**How a repeat behaves.** Ticking off a repeating item closes out *that*
occurrence and creates the next one as a new row, carrying across the
category, time, priority, notes and subtasks (subtasks come back unticked).
This is the Apple Reminders model, and it means your completed history stays
intact instead of one row quietly hopping forward forever. An occurrence you
*don't* finish stays where it is and goes overdue rather than skipping ahead
on its own — if you want to move past one without completing it, use
**Skip this one**, which advances the date and doesn't spend an occurrence
from an "after N times" budget.

**Custom rules** cover: every N days / weeks / months / years; specific
weekdays for weekly rules; "the 14th" vs. "the second Tuesday" for monthly
ones; counting the next date from the scheduled date or from the day you
actually finished it; and ending never, on a date, or after a set number of
times. The picker always shows a plain-English summary of what you've set
("Every 2 weeks on Mon, Wed · until Dec 1").

**In Apple Calendar**, a repeating meeting is published as a single event
carrying a standard `RRULE`, so Calendar expands the series itself. The one
exception is a rule counted from the completion date — that isn't a fixed
schedule, so only the current occurrence is published.

The date maths lives in `src/lib/recurrence.js` and is covered by
`npm test` (leap years, month-end clamping, DST, the nth-weekday-of-month
edge where a month has only four).

## One honest limitation up front

Vercel's free-tier cron jobs can only run **once a day**, so they can't power
"notify me 30 minutes before" on their own. The fix here is a free external
trigger (GitHub Actions, included) that pings your notification-check endpoint
every ~10 minutes instead. GitHub Actions schedules aren't perfectly precise
either — under heavy load GitHub can delay a run by several minutes, and
GitHub disables a schedule automatically after 60 days of no commits to the
repo (a `workflow_dispatch` button is included so you can manually kick it,
and any new commit re-arms it). If you want tighter reliability, swap in a
dedicated free scheduler like cron-job.org pointed at the same URL — same
`x-cron-secret` header, no code changes needed.

---

## 1. Create the Supabase project (database + auth)

1. Go to supabase.com → New project (free tier). Save the database password somewhere.
2. Once it's up: **Project Settings → API** — copy the **Project URL** and the
   **anon public** key. You'll need these in step 4.
3. Also copy the **service_role** key from the same page — this one is
   secret, never put it in the frontend. You'll need it in step 4 too.
4. **SQL Editor → New query** — paste in the entire contents of
   `supabase/schema.sql` from this project and run it. This creates the
   tables, locks each user to their own rows (Row Level Security), and turns
   on Realtime for live sync.
   - **Already deployed an earlier version?** Don't re-run `schema.sql` —
     run the migrations you're missing instead. Each only *adds* columns and
     leaves existing data alone, and they're safe to re-run:
     - `supabase/migration_002_smart_lists.sql` — due time, priority, flagged,
       notes, subtasks.
     - `supabase/migration_003_recurrence.sql` — the `repeat_rule` column on
       tasks/reminders/meetings, plus `user_settings.timezone`. **Required for
       repeating items to work**, and it's what lets notifications fire on your
       clock rather than the server's.
5. **Authentication → Providers**: Email is on by default. If you'd rather
   skip email confirmation while you're testing solo, go to
   **Authentication → Settings** and turn off "Confirm email" — turn it back
   on before real multi-user use.

## 2. Generate your push notification keys (VAPID)

You need Node.js installed locally for this one command (or run it in any
online Node sandbox):

```
npx web-push generate-vapid-keys
```

This prints a **Public Key** and a **Private Key**. Save both.

## 3. Put the code on GitHub

1. Create a new empty repo on GitHub.
2. Push this project's contents to it (the `.gitignore` already excludes
   `node_modules`, `.env`, and build output).

## 4. Deploy to Vercel

1. vercel.com → New Project → import your GitHub repo. Vercel auto-detects
   the Vite frontend and the `/api` folder as serverless functions — no
   config needed.
2. Before deploying, add these **Environment Variables** (Project Settings →
   Environment Variables):

   | Name | Value | Notes |
   |---|---|---|
   | `VITE_SUPABASE_URL` | from step 1.2 | exposed to the browser — that's fine, it's meant to be public |
   | `VITE_SUPABASE_ANON_KEY` | from step 1.2 | also meant to be public |
   | `VITE_VAPID_PUBLIC_KEY` | from step 2 | public by design |
   | `SUPABASE_SERVICE_ROLE_KEY` | from step 1.3 | **secret** — server-side only |
   | `VAPID_PRIVATE_KEY` | from step 2 | **secret** |
   | `VAPID_SUBJECT` | `mailto:you@example.com` | any contact email/URL — required by the Web Push spec |
   | `CRON_SECRET` | make up a long random string | shared secret so randoms can't trigger your notification job |

3. Deploy. You'll get a URL like `https://your-app.vercel.app`.

## 5. Wire up the notification trigger

1. In your GitHub repo → **Settings → Secrets and variables → Actions** →
   add a secret named `CRON_SECRET` with the same value you used in Vercel.
2. Edit `.github/workflows/notify-cron.yml` and replace `YOUR-APP.vercel.app`
   with your actual Vercel domain.
3. Commit and push. The workflow will start running on its schedule (you can
   also trigger it once immediately from the repo's **Actions** tab to
   confirm it works).

## 6. Sign up and install the app

- Open your Vercel URL, sign up for an account, sign in.
- **iPhone**: open the URL in Safari → Share icon → **Add to Home Screen**.
  Then **open it from the Home Screen icon, not Safari** — this matters: iOS
  only allows push notifications for apps opened this way.
- **Android**: open in Chrome → menu → **Install app** (or "Add to Home screen").
- **Laptop**: Chrome/Edge show an install icon in the address bar; or just
  bookmark it — a browser tab syncs live too.
- Inside the installed app, open **Settings** and tap **Turn on** under
  Notifications, then allow the permission prompt.

## 7. Subscribe to it in Apple Calendar

- In **Settings → Settings/notifications panel** of the app, copy the calendar feed URL.
- On your Mac: **Calendar → Settings → Accounts → Add (+) → Add Subscribed
  Calendar** → paste the URL.
- On iPhone: **Settings app → Calendar → Accounts → Add Account → Other →
  Add Subscribed Calendar** → paste the URL.
- Apple refreshes subscribed calendars periodically on its own schedule
  (typically every few hours) — it's not instant, and there's no way to make
  it instant without a full paid CalDAV integration, which is a much bigger
  undertaking than this app needs.

---

## Local development (optional)

```
npm install
cp .env.example .env      # fill in the VITE_ values
npm run dev
npm test                  # recurrence + timezone maths (no network, no DB)
```

The `/api` functions won't run under plain `vite dev` — use `vercel dev`
(`npm i -g vercel`, then `vercel dev`) if you want to test the ICS feed or
notification endpoint locally.

## Notes on how it's built

- **Sync** is Supabase Realtime: every device subscribed to your account
  gets Postgres change events over a websocket, so edits appear on other
  signed-in devices within about a second.
- **Data isolation**: Postgres Row Level Security enforces that a user can
  only ever read/write rows where `user_id` matches their own auth id — this
  is what makes "multiple users" safe, not just a checkbox in the UI.
- **The Apple Calendar feed URL contains a random token** instead of
  requiring login, because Apple's calendar subscription feature can't send
  auth headers. Treat that URL like a password — anyone with it can read
  your meeting titles/locations. You can invalidate it any time by rotating
  `ics_token` in the `user_settings` table.
- View preference (tabs vs. stacked), the theme, and the last open section are
  stored per-device in `localStorage`, not synced — those are UI settings, not
  your data.
- **Timezones**: meetings and reminders are stored as a bare date and time with
  no offset, and the notification job runs on a UTC server. Your browser records
  its IANA timezone into `user_settings.timezone` on each sign-in, and the job
  uses it to read a stored 9am as *your* 9am. Without it, "30 minutes before"
  was off by your whole UTC offset and "due today" used the wrong day for part
  of every day.
- **Styling** is one stylesheet, `src/index.css`. Media queries, hover-vs-touch
  rules, `env(safe-area-inset-*)` and dark mode can't be expressed as inline
  style objects, and those are exactly what make the app work on a phone.
- **Reminder timing**: a reminder with a time of day is announced near that
  time; one without waits until 8am your time rather than pinging at local
  midnight. Either way it's announced at most once per day.
