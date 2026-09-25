import { createClient } from "@supabase/supabase-js";
import { createEvents } from "ics";

// Public, unauthenticated endpoint (by design — Apple Calendar's subscription
// feature can't send login headers). Security comes from the token being a
// random, unguessable UUID stored per-user, not from a password.
export default async function handler(req, res) {
  const { token } = req.query;
  if (!token) {
    res.status(400).send("Missing token");
    return;
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: settings, error: settingsErr } = await supabase
    .from("user_settings")
    .select("user_id")
    .eq("ics_token", token)
    .single();

  if (settingsErr || !settings) {
    res.status(404).send("Unknown calendar token");
    return;
  }

  const { data: meetings, error: meetingsErr } = await supabase
    .from("meetings")
    .select("*")
    .eq("user_id", settings.user_id);

  if (meetingsErr) {
    res.status(500).send("Could not load meetings");
    return;
  }

  const events = (meetings || [])
    .filter((m) => m.date) // undated meetings can't become calendar events
    .map((m) => {
      const [y, mo, d] = m.date.split("-").map(Number);
      let h = 9, min = 0; // default to 9am if no time was set
      if (m.time) {
        const [hh, mm] = m.time.split(":").map(Number);
        h = hh; min = mm;
      }
      return {
        uid: `${m.id}@baher-dashboard`,
        title: m.title,
        start: [y, mo, d, h, min],
        duration: { hours: 1 },
        location: m.location || undefined,
        description: `Project: ${m.project}`,
        alarms: [{ action: "display", trigger: { minutes: 30, before: true } }],
        status: m.status === "done" ? "CONFIRMED" : "CONFIRMED",
      };
    });

  const { error: icsErr, value } = createEvents(events);
  if (icsErr) {
    res.status(500).send("Could not build calendar feed");
    return;
  }

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(value);
}
