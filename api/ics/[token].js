import { createClient } from "@supabase/supabase-js";
import { createEvents } from "ics";
import { toRRule } from "../../src/lib/recurrence.js";

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

  const events = (meetings || [])
    .filter((m) => m.date) // undated meetings can't become calendar events
    .map((m) => {
      const [y, mo, d] = m.date.split("-").map(Number);
      let h = 9, min = 0; // default to 9am if no time was set
      if (m.time) {
        const [hh, mm] = m.time.split(":").map(Number);
        h = hh; min = mm;
      }

      // A repeating meeting goes out as ONE event carrying an RRULE, so Calendar
      // expands the series natively (and honours a later edit to the rule).
      // Rules counted from the completion date have no fixed schedule, so
      // toRRule returns null and only this occurrence is published.
      const rrule = toRRule(m.repeat_rule, m.date);

      return {
        uid: `${m.id}@baher-dashboard`,
        title: m.title,
        start: [y, mo, d, h, min],
        // A meeting is stored as wall-clock date + time with no timezone, so it
        // has to go out as floating local time. Left to itself the ics library
        // stamps a Z on DTSTART, which made a 9:30am meeting land at 9:30 UTC —
        // i.e. the wrong hour in Apple Calendar for anyone outside UTC. It also
        // keeps DTSTART and the RRULE's UNTIL in the same form, as RFC 5545
        // requires.
        startInputType: "local",
        startOutputType: "local",
        duration: { hours: 1 },
        location: m.location || undefined,
        description: `Category: ${m.project}`,
        alarms: [{ action: "display", description: m.title, trigger: { minutes: 30, before: true } }],
        status: "CONFIRMED",
        ...(rrule ? { recurrenceRule: rrule } : {}),
      };
    });

  if (events.length === 0) {
    // createEvents([]) produces nothing usable; an empty but valid calendar is
    // what Apple Calendar expects for a feed with no events yet.
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res
      .status(200)
      .send("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//baher-dashboard//EN\r\nCALSCALE:GREGORIAN\r\nEND:VCALENDAR\r\n");
    return;
  }

  const { error: icsErr, value } = createEvents(events);
  if (icsErr) {
    console.error("ics build failed", icsErr);
    res.status(500).send("Could not build calendar feed");
    return;
  }

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(value);
}
