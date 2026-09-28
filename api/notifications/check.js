import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { zonedWallTimeToDate, localDateStr, localMinutes, isValidTimeZone } from "../_lib/tz.js";

// Called by an external scheduler (GitHub Actions / cron-job.org — see README)
// every ~10 minutes, since Vercel's own free-tier cron only runs once a day.

// A meeting is announced once it's this close.
const MEETING_LEAD_MINUTES = 30;
// The daily reminder nudge waits until it's a civil hour where the user is,
// instead of firing at whatever moment the job first noticed the row.
const NUDGE_AFTER_LOCAL_MINUTE = 8 * 60;
// Fall back to this when a user has never opened the app in a browser that
// reported a timezone.
const DEFAULT_TZ = "UTC";

export default async function handler(req, res) {
  const secret = req.headers["x-cron-secret"];
  if (!secret || secret !== process.env.CRON_SECRET) {
    res.status(401).send("Unauthorized");
    return;
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VITE_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const now = new Date();
  // Everything below is decided in each user's own timezone, so the candidate
  // window has to be wide enough to cover every offset on earth (±14h) — hence
  // yesterday, today and tomorrow in UTC terms.
  const utcToday = now.toISOString().slice(0, 10);
  const shift = (days) => new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
  const windowDates = [shift(-1), utcToday, shift(1)];

  // One lookup of everyone's timezone, rather than a query per row.
  const { data: settingsRows } = await supabase.from("user_settings").select("user_id, timezone");
  const tzOf = new Map(
    (settingsRows || []).map((s) => [s.user_id, isValidTimeZone(s.timezone) ? s.timezone : DEFAULT_TZ])
  );
  const zoneFor = (userId) => tzOf.get(userId) || DEFAULT_TZ;

  let sentCount = 0;

  // --- Meetings starting within the lead window, not yet notified ---
  const { data: meetings } = await supabase
    .from("meetings")
    .select("*")
    .eq("status", "upcoming")
    .is("notified_at", null)
    .in("date", windowDates);

  for (const m of meetings || []) {
    if (!m.date) continue;
    const start = zonedWallTimeToDate(m.date, m.time ? m.time.slice(0, 5) : null, zoneFor(m.user_id));
    const minutesUntil = (start - now) / 60000;
    if (minutesUntil < 0 || minutesUntil > MEETING_LEAD_MINUTES) continue;

    const sent = await notifyUser(supabase, m.user_id, {
      title: "Upcoming meeting",
      body: `${m.title}${m.time ? " at " + m.time.slice(0, 5) : ""}${m.location ? " · " + m.location : ""}`,
    });
    if (sent) {
      await supabase.from("meetings").update({ notified_at: new Date().toISOString() }).eq("id", m.id);
      sentCount++;
    }
  }

  // --- Reminders due today (or overdue), not yet notified today ---
  const { data: reminders } = await supabase
    .from("reminders")
    .select("*")
    .eq("status", "todo")
    .not("due_date", "is", null)
    .lte("due_date", windowDates[2]);

  for (const r of reminders || []) {
    const tz = zoneFor(r.user_id);
    const today = localDateStr(tz, now);
    if (r.due_date > today) continue;          // not due where this user lives yet
    if (r.notified_on === today) continue;     // already nudged today

    // A reminder with a time of day is announced near that time; one without
    // waits for the morning rather than pinging at local midnight.
    if (r.due_date === today && r.due_time) {
      const dueAt = zonedWallTimeToDate(r.due_date, r.due_time.slice(0, 5), tz);
      if (now < dueAt - MEETING_LEAD_MINUTES * 60000) continue;
    } else if (localMinutes(tz, now) < NUDGE_AFTER_LOCAL_MINUTE) {
      continue;
    }

    const overdue = r.due_date < today;
    const sent = await notifyUser(supabase, r.user_id, {
      title: overdue ? "Overdue reminder" : "Reminder due today",
      body: r.title,
    });
    if (sent) {
      await supabase.from("reminders").update({ notified_on: today }).eq("id", r.id);
      sentCount++;
    }
  }

  res.status(200).json({ ok: true, sent: sentCount });
}

async function notifyUser(supabase, userId, payload) {
  const { data: subs } = await supabase.from("push_subscriptions").select("*").eq("user_id", userId);
  if (!subs || subs.length === 0) return false;
  let anySent = false;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      );
      anySent = true;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        // The browser threw this subscription away; stop trying to reach it.
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
      } else {
        console.error("push send failed", err.statusCode, err.body);
      }
    }
  }
  return anySent;
}
