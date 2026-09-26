import { zonedWallTimeToDate, localDateStr, localMinutes, isValidTimeZone } from "./tz.js";
let fail = 0;
const eq = (a, e, l) => {
  if (String(a) !== String(e)) { console.log(`FAIL ${l}\n  got ${a}\n  exp ${e}`); fail++; }
  else console.log(`ok   ${l} → ${a}`);
};

// 9:30am Sydney on 2026-09-28 (AEST, UTC+10) = 2026-09-27T23:30Z
eq(zonedWallTimeToDate("2026-09-28", "09:30", "Australia/Sydney").toISOString(), "2026-09-27T23:30:00.000Z", "Sydney wall time → UTC");
eq(zonedWallTimeToDate("2026-09-28", "09:30", "America/New_York").toISOString(), "2026-09-28T13:30:00.000Z", "New York EDT → UTC");
// Same clock time in January (EST, UTC-5) — proves DST is actually consulted
eq(zonedWallTimeToDate("2026-01-28", "09:30", "America/New_York").toISOString(), "2026-01-28T14:30:00.000Z", "New York EST → UTC");
// DST edges. 2026-03-08 02:30 doesn't exist; 2026-11-01 01:30 happens twice.
eq(zonedWallTimeToDate("2026-03-08", "02:30", "America/New_York").toISOString(), "2026-03-08T06:30:00.000Z", "spring-forward gap lands before the jump");
eq(zonedWallTimeToDate("2026-03-08", "03:30", "America/New_York").toISOString(), "2026-03-08T07:30:00.000Z", "3:30am EDT is unambiguous");
eq(zonedWallTimeToDate("2026-11-01", "01:30", "America/New_York").toISOString(), "2026-11-01T05:30:00.000Z", "fall-back overlap takes the first");
eq(zonedWallTimeToDate("2026-09-28", null, "Europe/London").toISOString(), "2026-09-28T08:00:00.000Z", "no time defaults to 9am local (BST)");
eq(zonedWallTimeToDate("2026-09-28", "09:30", "Asia/Kolkata").toISOString(), "2026-09-28T04:00:00.000Z", "half-hour offset zone");

// 02:00Z on the 28th is still the 27th in New York — the reason the job can't
// just use the server's date.
eq(localDateStr("America/New_York", new Date("2026-09-28T02:00:00Z")), "2026-09-27", "localDateStr behind UTC");
eq(localDateStr("Australia/Sydney", new Date("2026-09-27T20:00:00Z")), "2026-09-28", "localDateStr ahead of UTC");
eq(localMinutes("America/New_York", new Date("2026-09-28T13:30:00Z")), 9 * 60 + 30, "localMinutes");
eq(localMinutes("Asia/Kolkata", new Date("2026-09-28T18:30:00Z")), 0, "localMinutes at local midnight");

eq(isValidTimeZone("America/New_York"), true, "valid tz accepted");
eq(isValidTimeZone("Mars/Olympus"), false, "invalid tz rejected");
eq(isValidTimeZone(null), false, "null tz rejected");

console.log(fail ? `\n${fail} FAILED` : "\nALL PASS");
process.exit(fail ? 1 : 0);
