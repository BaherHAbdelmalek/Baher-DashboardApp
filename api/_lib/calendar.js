import { createEvents } from "ics";
import { toRRule } from "../../src/lib/recurrence.js";

const CAL_NAME = "Baher Dashboard";

/** Turns a user's meetings into an iCalendar feed.
 *
 *  Pure on purpose — the handler owns the database and the HTTP response, this
 *  owns the calendar, and the invariant that matters (never emit a
 *  component-less calendar) can then be tested without a database.
 *
 *  Returns { error, value } exactly as the ics library does. */
export function buildCalendar(meetings, userId) {
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

  // A VCALENDAR with no components is not valid iCalendar. RFC 5545 defines
  //   icalbody = calprops component
  //   component = 1*(eventc / todoc / journalc / freebusyc / timezonec / ...)
  // — one or MORE. An earlier version sent a component-less calendar whenever a
  // user had no dated meetings, and Apple Calendar rejected the subscription
  // outright with "Validation failed". It looked account-specific because it
  // was: whoever already had a meeting got a valid feed, whoever didn't got an
  // invalid one.
  //
  // An empty feed therefore carries one placeholder. It's dated far in the past
  // so it stays out of the way, and it's gone on the next refresh as soon as
  // there's a real meeting to publish.
  if (events.length === 0) {
    events.push({
      uid: `empty-${userId}@baher-dashboard`,
      title: "No meetings yet",
      description: "Meetings you add in Baher Dashboard will appear in this calendar.",
      start: [2000, 1, 1], // three numbers = an all-day event (VALUE=DATE)
      duration: { days: 1 },
      status: "CONFIRMED",
    });
  }

  return createEvents(events, { calName: CAL_NAME });
}
