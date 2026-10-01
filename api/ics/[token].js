import { createClient } from "@supabase/supabase-js";
import { buildCalendar } from "../_lib/calendar.js";

// Public, unauthenticated endpoint (by design — Apple Calendar's subscription
// feature can't send login headers). Security comes from the token being a
// random, unguessable UUID stored per-user, not from a password.
export default async function handler(req, res) {
  const { token } = req.query;
  if (!token) {
    res.status(400).send("Missing token");
    return;
  }
  // Fail fast on a malformed token rather than sending garbage to Postgres,
  // where a non-uuid value makes the query error instead of simply not matching.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    res.status(404).send("Unknown calendar token");
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
    .maybeSingle();

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

  const { error: icsErr, value } = buildCalendar(meetings, settings.user_id);
  if (icsErr) {
    console.error("ics build failed", icsErr);
    res.status(500).send("Could not build calendar feed");
    return;
  }

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(value);
}
