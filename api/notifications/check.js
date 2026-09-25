import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Called by an external scheduler (GitHub Actions / cron-job.org — see README)
// every ~10 minutes, since Vercel's own free-tier cron only runs once a day.
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
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrowStr = new Date(now.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  let sentCount = 0;

  // --- Meetings starting within the next 30 minutes, not yet notified ---
  const { data: meetings } = await supabase
    .from("meetings")
    .select("*")
    .eq("status", "upcoming")
    .is("notified_at", null)
    .in("date", [todayStr, tomorrowStr]);

  for (const m of meetings || []) {
    if (!m.date) continue;
    const timePart = m.time ? `${m.time}` : "09:00:00";
    const start = new Date(`${m.date}T${timePart}`);
    const minutesUntil = (start - now) / 60000;
    if (minutesUntil >= 0 && minutesUntil <= 30) {
      const sent = await notifyUser(supabase, m.user_id, {
        title: "Upcoming meeting",
        body: `${m.title}${m.time ? " at " + m.time.slice(0, 5) : ""}${m.location ? " · " + m.location : ""}`,
      });
      if (sent) {
        await supabase.from("meetings").update({ notified_at: new Date().toISOString() }).eq("id", m.id);
        sentCount++;
      }
    }
  }

  // --- Reminders due today or overdue, not yet notified today ---
  const { data: reminders } = await supabase
    .from("reminders")
    .select("*")
    .eq("status", "todo")
    .not("due_date", "is", null)
    .lte("due_date", todayStr);

  for (const r of reminders || []) {
    if (r.notified_on === todayStr) continue;
    const overdue = r.due_date < todayStr;
    const sent = await notifyUser(supabase, r.user_id, {
      title: overdue ? "Overdue reminder" : "Reminder due today",
      body: r.title,
    });
    if (sent) {
      await supabase.from("reminders").update({ notified_on: todayStr }).eq("id", r.id);
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
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
      } else {
        console.error("push send failed", err.statusCode, err.body);
      }
    }
  }
  return anySent;
}
