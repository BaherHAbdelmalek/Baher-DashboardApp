import { nextDate, presetToRule, advance, toRRule, describeRule, ruleToPreset, normalizeRule, addDays, weekdayOf } from "./recurrence.js";

let fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.log(`FAIL ${label}\n  got      ${a}\n  expected ${e}`); fail++; }
  else console.log(`ok   ${label} → ${a}`);
}

// --- daily
eq(nextDate(presetToRule("daily"), "2026-02-27"), "2026-02-28", "daily across Feb (non-leap 2026)");
eq(nextDate({freq:"day",interval:3}, "2026-12-30"), "2027-01-02", "every 3 days across year end");

// --- weekly
eq(nextDate(presetToRule("weekly","2026-09-26"), "2026-09-26"), "2026-10-03", "weekly same weekday (Sat)");
eq(nextDate(presetToRule("biweekly","2026-09-26"), "2026-09-26"), "2026-10-10", "biweekly");
// weekdays Mon-Fri: Friday 2026-09-25 -> Monday 2026-09-28
eq(weekdayOf("2026-09-25"), 5, "2026-09-25 is a Friday");
eq(nextDate(presetToRule("weekdays"), "2026-09-25"), "2026-09-28", "weekdays Fri→Mon");
eq(nextDate(presetToRule("weekdays"), "2026-09-28"), "2026-09-29", "weekdays Mon→Tue");
// every 2 weeks on Mon+Wed, from a Wed (2026-09-30)
eq(nextDate({freq:"week",interval:2,weekdays:[1,3]}, "2026-09-30"), "2026-10-12", "2-weekly Mon/Wed from Wed → Mon two weeks on");
eq(nextDate({freq:"week",interval:2,weekdays:[1,3]}, "2026-10-12"), "2026-10-14", "…then Wed same week");

// --- monthly with clamping
eq(nextDate(presetToRule("monthly"), "2026-01-31"), "2026-02-28", "Jan 31 + 1mo clamps to Feb 28 (2026)");
eq(nextDate(presetToRule("monthly"), "2024-01-31"), "2024-02-29", "Jan 31 + 1mo clamps to Feb 29 (leap)");
eq(nextDate(presetToRule("quarterly"), "2026-11-15"), "2027-02-15", "quarterly across year end");
eq(nextDate(presetToRule("monthly"), "2026-12-15"), "2027-01-15", "monthly across year end");
// nth-weekday: 2026-09-08 is the 2nd Tuesday of Sep
eq(weekdayOf("2026-09-08"), 2, "2026-09-08 is a Tuesday");
eq(nextDate({freq:"month",interval:1,monthMode:"weekday"}, "2026-09-08"), "2026-10-13", "2nd Tue of Sep → 2nd Tue of Oct");
// 5th Friday clamp: 2026-01-30 is the 5th Friday; Feb 2026 has only 4
eq(weekdayOf("2026-01-30"), 5, "2026-01-30 is a Friday");
eq(nextDate({freq:"month",interval:1,monthMode:"weekday"}, "2026-01-30"), "2026-02-27", "5th Fri clamps to last Fri of Feb");

// --- yearly, incl. leap day
eq(nextDate(presetToRule("yearly"), "2024-02-29"), "2025-02-28", "Feb 29 + 1yr clamps to Feb 28");
eq(nextDate(presetToRule("yearly"), "2026-03-01"), "2027-03-01", "yearly");

// --- ends: after N
const after3 = {...presetToRule("daily"), ends:{type:"after",count:3}, done:0};
eq(advance({due_date:"2026-09-26", repeat_rule:after3}, "2026-09-26"), {nextDate:"2026-09-27", rule:{...normalizeRule(after3), done:1}}, "after-3: 1st completion spawns #2");
eq(advance({due_date:"2026-09-27", repeat_rule:{...after3,done:1}}, "2026-09-27").nextDate, "2026-09-28", "after-3: 2nd completion spawns #3");
eq(advance({due_date:"2026-09-28", repeat_rule:{...after3,done:2}}, "2026-09-28"), null, "after-3: 3rd completion ends series");

// --- ends: on date
const untilRule = {...presetToRule("weekly","2026-09-26"), ends:{type:"on",date:"2026-10-05"}};
eq(advance({due_date:"2026-09-26", repeat_rule:untilRule}, "2026-09-26").nextDate, "2026-10-03", "until: inside window");
eq(advance({due_date:"2026-10-03", repeat_rule:untilRule}, "2026-10-03"), null, "until: next would pass end date");

// --- from: completion
const fromDone = {...presetToRule("daily"), from:"completion"};
eq(advance({due_date:"2026-09-20", repeat_rule:fromDone}, "2026-09-26").nextDate, "2026-09-27", "from completion: overdue task rebases on today");
eq(advance({due_date:"2026-09-20", repeat_rule:presetToRule("daily")}, "2026-09-26").nextDate, "2026-09-21", "from due: overdue task keeps original cadence");

// --- skip doesn't spend the budget
eq(advance({due_date:"2026-09-26", repeat_rule:after3}, "2026-09-26", "skip").rule.done, 0, "skip keeps done count");

// --- RRULE output for the calendar feed
eq(toRRule(presetToRule("daily"), "2026-09-26"), "FREQ=DAILY", "rrule daily");
eq(toRRule(presetToRule("weekdays"), "2026-09-25"), "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "rrule weekdays");
eq(toRRule(presetToRule("biweekly","2026-09-26"), "2026-09-26"), "FREQ=WEEKLY;BYDAY=SA;INTERVAL=2", "rrule biweekly");
eq(toRRule(presetToRule("weekly"), "2026-09-26"), "FREQ=WEEKLY;BYDAY=SA", "rrule weekly infers weekday from anchor");
eq(toRRule(presetToRule("quarterly"), "2026-09-26"), "FREQ=MONTHLY;INTERVAL=3", "rrule quarterly");
eq(toRRule({freq:"month",interval:1,monthMode:"weekday"}, "2026-09-08"), "FREQ=MONTHLY;BYDAY=2TU", "rrule nth weekday");
eq(toRRule(presetToRule("yearly"), "2026-09-26"), "FREQ=YEARLY", "rrule yearly");
eq(toRRule(untilRule, "2026-09-26"), "FREQ=WEEKLY;BYDAY=SA;UNTIL=20261005T235959", "rrule until (floating, per RFC 5545)");
eq(toRRule({...after3, done:1}, "2026-09-26"), "FREQ=DAILY;COUNT=2", "rrule count excludes occurrences already done");
eq(toRRule({...presetToRule("daily"), from:"completion"}, "2026-09-26"), null, "from-completion has no fixed schedule, so no rrule");
eq(toRRule(null, "2026-09-26"), null, "rrule of no rule is null");
eq(toRRule(presetToRule("daily"), null), null, "rrule needs an anchor date");

// --- normalisation / round-trip
eq(normalizeRule({freq:"bogus"}), null, "bogus freq → null");
eq(normalizeRule({freq:"week",interval:"0",weekdays:[9,3,3]}), {freq:"week",interval:1,weekdays:[3],monthMode:"date",from:"due",ends:{type:"never"},done:0}, "normalises junk");
for (const p of ["daily","weekdays","weekly","biweekly","monthly","quarterly","yearly"]) {
  eq(ruleToPreset(presetToRule(p,"2026-09-26")), p, `round-trip preset ${p}`);
}
eq(ruleToPreset(null), "none", "null → none preset");
eq(ruleToPreset({freq:"day",interval:1,ends:{type:"after",count:5}}), "custom", "non-default end → custom");

// --- descriptions
eq(describeRule(presetToRule("weekdays")), "Every weekday", "describe weekdays");
eq(describeRule({freq:"week",interval:2,weekdays:[1,3]}), "Every 2 weeks on Mon, Wed", "describe custom weekly");
eq(describeRule(presetToRule("monthly"), "2026-09-03"), "Every month on the 3rd", "describe monthly ordinal");
eq(describeRule({freq:"month",interval:1,monthMode:"weekday"}, "2026-09-08"), "Every month on the 2nd Tue", "describe nth weekday");
eq(describeRule({...presetToRule("daily"), ends:{type:"after",count:5}, done:2}), "Every day · 5 times (3 left)", "describe budget");
eq(describeRule(null), "Does not repeat", "describe null");

// --- no infinite loops / no crashes on adversarial input
eq(nextDate({freq:"week",interval:365,weekdays:[]}, "2026-09-26"), "2033-09-24", "huge interval still terminates");

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
