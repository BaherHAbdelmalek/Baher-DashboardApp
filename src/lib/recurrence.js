/* ============================================================================
   Recurrence
   ----------------------------------------------------------------------------
   A repeat rule lives in a single jsonb column (`repeat_rule`) on tasks,
   reminders and meetings. Shape:

     {
       freq:     "day" | "week" | "month" | "year",
       interval: 1..365,              // every N days/weeks/months/years
       weekdays: [0..6],              // freq "week" only; 0 = Sunday. Empty
                                      // means "the same weekday as the due date"
       monthMode:"date" | "weekday",  // freq "month" only: the 14th, or the
                                      // 2nd Tuesday
       from:     "due" | "completion",// count the next one from the scheduled
                                      // date, or from when you actually finished
       ends:     { type: "never" }
               | { type: "on",    date: "YYYY-MM-DD" }
               | { type: "after", count: 1..999 },
       done:     0                    // occurrences completed so far
     }

   All date maths is done on plain YYYY-MM-DD strings via UTC epoch days, so it
   is immune to DST shifts and to the local/UTC off-by-one that bites naive
   `new Date(str)` arithmetic.
   ========================================================================== */

const DAY_MS = 86400000;

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];

/* ---------- date helpers (string in, string out) ---------- */

export function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return { y, m, d };
}

function fmt(y, m, d) {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function toEpochDay(str) {
  const { y, m, d } = parseDate(str);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromEpochDay(n) {
  const dt = new Date(n * DAY_MS);
  return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(str, n) {
  return fromEpochDay(toEpochDay(str) + n);
}

export function weekdayOf(str) {
  const { y, m, d } = parseDate(str);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Adds whole months, clamping the day to the end of the target month so that
 *  Jan 31 + 1 month is Feb 28/29 rather than rolling into March. */
function addMonths(str, n) {
  const { y, m, d } = parseDate(str);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return fmt(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** Which occurrence of its weekday a date is within its month (1st Tue = 1). */
function weekIndexInMonth(str) {
  return Math.floor((parseDate(str).d - 1) / 7) + 1;
}

/** The nth <weekday> of a month, clamped back to the last one if n overflows. */
function nthWeekdayOfMonth(y, m, weekday, n) {
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  let day = 1 + ((weekday - firstDow + 7) % 7) + (n - 1) * 7;
  const dim = daysInMonth(y, m);
  while (day > dim) day -= 7;
  return fmt(y, m, day);
}

/* ---------- rule normalisation ---------- */

export const EMPTY_RULE = null;

const FREQS = ["day", "week", "month", "year"];

/** Coerces whatever is in the database into a valid rule, or null for "no
 *  repeat". Defensive on purpose: a row could predate this feature, or have
 *  been written by an older build. */
export function normalizeRule(raw) {
  if (!raw || typeof raw !== "object") return null;
  const freq = FREQS.includes(raw.freq) ? raw.freq : null;
  if (!freq) return null;

  let interval = Number(raw.interval);
  if (!Number.isFinite(interval)) interval = 1;
  interval = Math.min(365, Math.max(1, Math.round(interval)));

  const weekdays =
    freq === "week" && Array.isArray(raw.weekdays)
      ? [...new Set(raw.weekdays.map(Number).filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b)
      : [];

  const monthMode = freq === "month" && raw.monthMode === "weekday" ? "weekday" : "date";
  const from = raw.from === "completion" ? "completion" : "due";

  let ends = { type: "never" };
  if (raw.ends && raw.ends.type === "on" && typeof raw.ends.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.ends.date)) {
    ends = { type: "on", date: raw.ends.date };
  } else if (raw.ends && raw.ends.type === "after") {
    const count = Math.min(999, Math.max(1, Math.round(Number(raw.ends.count) || 1)));
    ends = { type: "after", count };
  }

  const done = Math.max(0, Math.round(Number(raw.done) || 0));

  return { freq, interval, weekdays, monthMode, from, ends, done };
}

/* ---------- presets ---------- */

export const PRESETS = [
  { id: "none", label: "Never" },
  { id: "daily", label: "Every day" },
  { id: "weekdays", label: "Every weekday (Mon–Fri)" },
  { id: "weekly", label: "Every week" },
  { id: "biweekly", label: "Every 2 weeks" },
  { id: "monthly", label: "Every month" },
  { id: "quarterly", label: "Every 3 months" },
  { id: "yearly", label: "Every year" },
  { id: "custom", label: "Custom…" },
];

const base = { weekdays: [], monthMode: "date", from: "due", ends: { type: "never" }, done: 0 };

export function presetToRule(presetId, anchorDate) {
  switch (presetId) {
    case "daily":     return { ...base, freq: "day", interval: 1 };
    case "weekdays":  return { ...base, freq: "week", interval: 1, weekdays: [1, 2, 3, 4, 5] };
    case "weekly":    return { ...base, freq: "week", interval: 1, weekdays: anchorDate ? [weekdayOf(anchorDate)] : [] };
    case "biweekly":  return { ...base, freq: "week", interval: 2, weekdays: anchorDate ? [weekdayOf(anchorDate)] : [] };
    case "monthly":   return { ...base, freq: "month", interval: 1 };
    case "quarterly": return { ...base, freq: "month", interval: 3 };
    case "yearly":    return { ...base, freq: "year", interval: 1 };
    case "custom":    return { ...base, freq: "week", interval: 1, weekdays: anchorDate ? [weekdayOf(anchorDate)] : [] };
    default:          return null;
  }
}

/** Maps a stored rule back onto a preset chip, so reopening a task shows
 *  "Every 2 weeks" rather than dumping you straight into the custom editor. */
export function ruleToPreset(rule) {
  const r = normalizeRule(rule);
  if (!r) return "none";
  const plainEnd = r.ends.type === "never";
  const plainFrom = r.from === "due";
  if (!plainEnd || !plainFrom) return "custom";

  if (r.freq === "day" && r.interval === 1) return "daily";
  if (r.freq === "week" && r.interval === 1) {
    const wd = r.weekdays;
    if (wd.length === 5 && [1, 2, 3, 4, 5].every((d) => wd.includes(d))) return "weekdays";
    if (wd.length <= 1) return "weekly";
    return "custom";
  }
  if (r.freq === "week" && r.interval === 2 && r.weekdays.length <= 1) return "biweekly";
  if (r.freq === "month" && r.monthMode === "date") {
    if (r.interval === 1) return "monthly";
    if (r.interval === 3) return "quarterly";
  }
  if (r.freq === "year" && r.interval === 1) return "yearly";
  return "custom";
}

/* ---------- the actual scheduling ---------- */

/** The next date strictly after `afterDate` that the rule lands on.
 *  Returns null only if the rule is unusable. */
export function nextDate(rule, afterDate) {
  const r = normalizeRule(rule);
  if (!r || !afterDate) return null;

  if (r.freq === "day") return addDays(afterDate, r.interval);
  if (r.freq === "year") return addMonths(afterDate, 12 * r.interval);

  if (r.freq === "month") {
    if (r.monthMode === "weekday") {
      const wd = weekdayOf(afterDate);
      const nth = weekIndexInMonth(afterDate);
      // Step month-by-month from the anchor so the nth-weekday stays stable.
      const anchor = addMonths(afterDate, r.interval);
      const { y, m } = parseDate(anchor);
      let candidate = nthWeekdayOfMonth(y, m, wd, nth);
      if (candidate <= afterDate) {
        const next = addMonths(anchor, r.interval);
        const p = parseDate(next);
        candidate = nthWeekdayOfMonth(p.y, p.m, wd, nth);
      }
      return candidate;
    }
    return addMonths(afterDate, r.interval);
  }

  // freq === "week"
  const days = r.weekdays.length ? r.weekdays : [weekdayOf(afterDate)];
  const weekStart = addDays(afterDate, -weekdayOf(afterDate)); // Sunday of that week
  // Candidate weeks are the anchor week, then every `interval` weeks after it.
  for (let n = 0; n < 600; n++) {
    const start = addDays(weekStart, n * 7 * r.interval);
    for (const d of days) {
      const candidate = addDays(start, d);
      if (candidate > afterDate) return candidate;
    }
  }
  return null;
}

/** Has the series run out — either past its end date, or past its occurrence
 *  budget? `doneCount` is how many occurrences will have been completed once
 *  the current one is checked off. */
export function seriesEnded(rule, candidateDate, doneCount) {
  const r = normalizeRule(rule);
  if (!r) return true;
  if (!candidateDate) return true;
  if (r.ends.type === "on") return candidateDate > r.ends.date;
  if (r.ends.type === "after") return doneCount >= r.ends.count;
  return false;
}

/** Work out the follow-up occurrence for an item being completed (or skipped).
 *  Returns { nextDate, rule } for the new row, or null when the series is over.
 *
 *  `mode` is "complete" (respects from: completion) or "skip" (always steps
 *  from the scheduled date, and doesn't spend an occurrence from the budget). */
export function advance(item, todayDate, mode = "complete") {
  const r = normalizeRule(item.repeat_rule);
  if (!r) return null;

  const scheduled = item.due_date || item.date || null;
  const anchor =
    mode === "complete" && r.from === "completion"
      ? todayDate
      : scheduled || todayDate;

  const next = nextDate(r, anchor);
  const done = mode === "complete" ? r.done + 1 : r.done;
  if (seriesEnded(r, next, done)) return null;

  return { nextDate: next, rule: { ...r, done } };
}

const RRULE_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** An iCalendar RRULE value (no "RRULE:" prefix) for the calendar feed, so
 *  Apple Calendar expands the series itself instead of us shipping hundreds of
 *  standalone events.
 *
 *  Returns null when the rule can't be expressed as an RRULE — specifically
 *  `from: "completion"`, where the next date depends on when you actually
 *  finish the thing and so isn't a fixed schedule at all. Callers fall back to
 *  publishing just the current occurrence. */
export function toRRule(rule, anchorDate) {
  const r = normalizeRule(rule);
  if (!r || !anchorDate) return null;
  if (r.from === "completion") return null;

  const parts = [];
  if (r.freq === "day") parts.push("FREQ=DAILY");
  else if (r.freq === "week") {
    parts.push("FREQ=WEEKLY");
    const days = r.weekdays.length ? r.weekdays : [weekdayOf(anchorDate)];
    parts.push(`BYDAY=${days.map((d) => RRULE_DAYS[d]).join(",")}`);
  } else if (r.freq === "month") {
    parts.push("FREQ=MONTHLY");
    if (r.monthMode === "weekday") {
      parts.push(`BYDAY=${weekIndexInMonth(anchorDate)}${RRULE_DAYS[weekdayOf(anchorDate)]}`);
    }
  } else {
    parts.push("FREQ=YEARLY");
  }

  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);

  if (r.ends.type === "on") {
    // DTSTART is floating local time, so RFC 5545 requires UNTIL to be too.
    parts.push(`UNTIL=${r.ends.date.replace(/-/g, "")}T235959`);
  } else if (r.ends.type === "after") {
    parts.push(`COUNT=${Math.max(1, r.ends.count - r.done)}`);
  }

  return parts.join(";");
}

/* ---------- human-readable summary ---------- */

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** e.g. "Every 2 weeks on Mon, Wed · until Dec 1" — shown under the picker so
 *  there's never any doubt about what was just configured. */
export function describeRule(rule, anchorDate) {
  const r = normalizeRule(rule);
  if (!r) return "Does not repeat";

  const n = r.interval;
  let text;

  if (r.freq === "day") {
    text = n === 1 ? "Every day" : `Every ${n} days`;
  } else if (r.freq === "week") {
    const days = r.weekdays.length
      ? r.weekdays
      : anchorDate
        ? [weekdayOf(anchorDate)]
        : [];
    const isWeekdays = days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d));
    const every = n === 1 ? "Every week" : `Every ${n} weeks`;
    if (isWeekdays && n === 1) text = "Every weekday";
    else if (days.length === 0) text = every;
    else text = `${every} on ${days.map((d) => WEEKDAY_SHORT[d]).join(", ")}`;
  } else if (r.freq === "month") {
    const every = n === 1 ? "Every month" : `Every ${n} months`;
    if (r.monthMode === "weekday" && anchorDate) {
      text = `${every} on the ${ordinal(weekIndexInMonth(anchorDate))} ${WEEKDAY_SHORT[weekdayOf(anchorDate)]}`;
    } else if (anchorDate) {
      text = `${every} on the ${ordinal(parseDate(anchorDate).d)}`;
    } else {
      text = every;
    }
  } else {
    text = n === 1 ? "Every year" : `Every ${n} years`;
  }

  if (r.ends.type === "on") {
    const { y, m, d } = parseDate(r.ends.date);
    const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
    });
    text += ` · until ${label}`;
  } else if (r.ends.type === "after") {
    const left = Math.max(0, r.ends.count - r.done);
    text += ` · ${r.ends.count} times (${left} left)`;
  }

  if (r.from === "completion") text += " · from completion date";
  return text;
}

/** Short form for the item row, e.g. "Repeats weekly". */
export function shortRuleLabel(rule) {
  const r = normalizeRule(rule);
  if (!r) return null;
  const unit = { day: "day", week: "week", month: "month", year: "year" }[r.freq];
  if (r.interval === 1) {
    if (r.freq === "week" && r.weekdays.length === 5 && [1, 2, 3, 4, 5].every((d) => r.weekdays.includes(d))) {
      return "weekdays";
    }
    return { day: "daily", week: "weekly", month: "monthly", year: "yearly" }[r.freq];
  }
  return `every ${r.interval} ${unit}s`;
}
