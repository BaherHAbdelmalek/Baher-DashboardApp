// Timezone helpers for the notification job.
//
// The job runs on a server in UTC, but "30 minutes before your 9am meeting"
// and "your reminders due today" are statements about the *user's* wall clock.
// Meetings and reminders are stored as bare date + time with no offset, so the
// user's IANA timezone (captured by the browser into user_settings.timezone)
// is what turns them into real instants.
//
// Files under api/_lib are helpers, not routes — Vercel ignores paths whose
// segments start with an underscore.

/** Milliseconds to add to a UTC instant to get the wall-clock reading in `tz`. */
function offsetMsAt(tz, utcMs) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));

  const p = {};
  for (const { type, value } of parts) p[type] = value;
  const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asIfUtc - utcMs;
}

export function isValidTimeZone(tz) {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** A bare YYYY-MM-DD + HH:MM read as wall time in `tz`, as a real Date.
 *
 *  The offset is looked up at the naive instant and then re-checked at the
 *  corrected one, which resolves the hour-wide disagreement you get near a DST
 *  transition. Two once-a-year edge cases stay inherently ambiguous: a wall
 *  time inside a spring-forward gap doesn't exist and lands on the instant an
 *  hour before the jump, and a wall time in a fall-back overlap happens twice
 *  and takes the first. Both are an hour out at worst, on a clock reading that
 *  is itself ill-defined. */
export function zonedWallTimeToDate(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh = 9, mi = 0] = (timeStr || "09:00").split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mi);
  let utc = naive - offsetMsAt(tz, naive);
  utc = naive - offsetMsAt(tz, utc);
  return new Date(utc);
}

/** Today's date, as YYYY-MM-DD, in `tz`. */
export function localDateStr(tz, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const p = {};
  for (const { type, value } of parts) p[type] = value;
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes since local midnight in `tz`. */
export function localMinutes(tz, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit",
  }).formatToParts(now);
  const p = {};
  for (const { type, value } of parts) p[type] = value;
  return +p.hour * 60 + +p.minute;
}
