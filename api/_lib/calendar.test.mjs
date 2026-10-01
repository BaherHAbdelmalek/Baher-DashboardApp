import { buildCalendar } from "./calendar.js";

let fail = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) fail++; };
const components = (s) => (s.match(/BEGIN:(VEVENT|VTODO|VJOURNAL|VFREEBUSY|VTIMEZONE)/g) || []).length;

function check(label, meetings) {
  const { error, value } = buildCalendar(meetings, "user-1");
  ok(!error, `${label}: builds without error${error ? " :: " + error : ""}`);
  if (error) return null;
  // The invariant that broke Apple Calendar: RFC 5545 requires a VCALENDAR to
  // carry at least one component. A feed with none fails validation outright,
  // which is what happened to any account with no dated meetings.
  ok(components(value) >= 1, `${label}: calendar has >=1 component (${components(value)})`);
  ok(/^BEGIN:VCALENDAR/.test(value) && /END:VCALENDAR\r?\n?$/.test(value.trim() + "\n"), `${label}: well-formed VCALENDAR`);
  return value;
}

// --- the case that failed in the wild: an account with nothing to publish ---
const empty = check("no meetings at all", []);
ok(/No meetings yet/.test(empty), "empty feed carries the placeholder");
ok(/DTSTART;VALUE=DATE:20000101/.test(empty), "placeholder is all-day and dated out of the way");

check("null meetings", null);

const undated = check("meetings exist but none have a date", [
  { id: "m1", title: "Someday lunch", project: "Other", date: null, time: null },
]);
ok(/No meetings yet/.test(undated), "undated-only feed also gets the placeholder");

// --- a normal account ---
const normal = check("one dated meeting", [
  { id: "m1", title: "Standup", project: "Admin", date: "2026-10-02", time: "09:30:00", location: "Teams" },
]);
ok(!/No meetings yet/.test(normal), "placeholder is absent once there is a real meeting");
ok(/SUMMARY:Standup/.test(normal), "the meeting is published");
// Floating local time: a Z here would shift every meeting by the user's offset.
ok(/DTSTART:20261002T093000(?!Z)/.test(normal), "DTSTART is floating local time, not UTC");
ok(/X-WR-CALNAME:Baher Dashboard/.test(normal), "calendar has a display name");

const repeating = check("repeating meeting", [
  { id: "m2", title: "Weekly sync", project: "Admin", date: "2026-10-02", time: "10:00:00",
    repeat_rule: { freq: "week", interval: 2, weekdays: [1, 3], ends: { type: "on", date: "2026-12-31" } } },
]);
ok(/RRULE:FREQ=WEEKLY;BYDAY=MO,WE;INTERVAL=2;UNTIL=20261231T235959/.test(repeating), "repeat goes out as one RRULE");
ok(components(repeating) === 1, "a repeating series is one component, not many");

// from-completion rules have no fixed schedule, so only this occurrence ships
const fromDone = check("repeat counted from completion", [
  { id: "m3", title: "Follow up", project: "Admin", date: "2026-10-02",
    repeat_rule: { freq: "day", interval: 1, from: "completion" } },
]);
ok(!/RRULE/.test(fromDone), "no RRULE for a completion-based rule");

// --- data that must not take the whole feed down ---
check("odd titles", [
  { id: "a", title: "", project: "Other", date: "2026-10-02" },
  { id: "b", title: "Review, plan; ship\nsecond line", project: "Other", date: "2026-10-03" },
  { id: "c", title: "Standup 🎯 " + "x".repeat(300), project: "Other", date: "2026-10-04" },
  { id: "d", title: "No location", project: "Other", date: "2026-10-05", location: "" },
]);
check("malformed repeat_rule is ignored, not fatal", [
  { id: "e", title: "Bad rule", project: "Other", date: "2026-10-02", repeat_rule: "not-an-object" },
  { id: "f", title: "Null rule", project: "Other", date: "2026-10-03", repeat_rule: null },
  { id: "g", title: "Junk freq", project: "Other", date: "2026-10-04", repeat_rule: { freq: "fortnight" } },
]);

console.log(fail ? `\n${fail} FAILED` : "\nALL PASS");
process.exit(fail ? 1 : 0);
