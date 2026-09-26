import { useState } from "react";
import { Repeat } from "lucide-react";
import {
  PRESETS,
  presetToRule,
  ruleToPreset,
  normalizeRule,
  describeRule,
  WEEKDAY_LETTER,
  WEEKDAY_SHORT,
  weekdayOf,
} from "../lib/recurrence";

const FREQ_OPTIONS = [
  { id: "day", one: "day", many: "days" },
  { id: "week", one: "week", many: "weeks" },
  { id: "month", one: "month", many: "months" },
  { id: "year", one: "year", many: "years" },
];

/** The repeat editor, shared by the add form and the per-item detail panel.
 *  `value` is a rule object (or null for "never"); `anchorDate` is the due date
 *  the rule hangs off, which is what makes "Every month on the 14th" concrete. */
export default function RepeatPicker({ value, onChange, anchorDate, compact = false }) {
  const rule = normalizeRule(value);
  const derived = ruleToPreset(rule);

  // "Custom…" has to be sticky rather than derived. The rule it starts you on
  // is deliberately an ordinary one (weekly on the due date's weekday), and
  // that round-trips straight back to the "Every week" preset — so a purely
  // derived dropdown would snap shut the instant you picked Custom, and the
  // detailed controls would never appear.
  const [forceCustom, setForceCustom] = useState(derived === "custom");
  const custom = forceCustom || derived === "custom";
  const preset = custom ? "custom" : derived;

  function setPreset(id) {
    setForceCustom(id === "custom");
    onChange(id === "none" ? null : presetToRule(id, anchorDate || null));
  }
  function patch(p) {
    onChange({ ...(rule || presetToRule("weekly", anchorDate)), ...p });
  }

  function toggleWeekday(d) {
    const current = rule?.weekdays?.length
      ? rule.weekdays
      : anchorDate
        ? [weekdayOf(anchorDate)]
        : [];
    const next = current.includes(d) ? current.filter((x) => x !== d) : [...current, d];
    // Refusing to empty the list keeps the rule meaningful — an "every week on
    // no days" rule would silently never fire again.
    patch({ weekdays: next.length ? next.sort((a, b) => a - b) : current });
  }

  const freqMeta = FREQ_OPTIONS.find((f) => f.id === rule?.freq) || FREQ_OPTIONS[1];
  const unitLabel = (rule?.interval || 1) === 1 ? freqMeta.one : freqMeta.many;

  return (
    <div className="repeat">
      <div className="repeat__row">
        <select
          className="field"
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          aria-label="Repeat"
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      {custom && (
        <>
          <div className="repeat__row">
            <span className="repeat__inline-label">Every</span>
            <input
              className="field repeat__interval"
              type="number"
              inputMode="numeric"
              min="1"
              max="365"
              value={rule.interval}
              onChange={(e) => patch({ interval: e.target.value })}
              aria-label="Repeat interval"
            />
            <select
              className="field"
              value={rule.freq}
              onChange={(e) => patch({ freq: e.target.value })}
              aria-label="Repeat unit"
            >
              {FREQ_OPTIONS.map((f) => (
                <option key={f.id} value={f.id}>{(rule.interval || 1) === 1 ? f.one : f.many}</option>
              ))}
            </select>
            <span className="repeat__inline-label sr-only">{unitLabel}</span>
          </div>

          {rule.freq === "week" && (
            <div className="repeat__days" role="group" aria-label="Repeat on these days">
              {WEEKDAY_LETTER.map((letter, d) => {
                const on = (rule.weekdays.length ? rule.weekdays : anchorDate ? [weekdayOf(anchorDate)] : []).includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    className={`repeat__day${on ? " repeat__day--on" : ""}`}
                    onClick={() => toggleWeekday(d)}
                    aria-pressed={on}
                    aria-label={WEEKDAY_SHORT[d]}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          )}

          {rule.freq === "month" && (
            <div className="repeat__row">
              <select
                className="field"
                value={rule.monthMode}
                onChange={(e) => patch({ monthMode: e.target.value })}
                aria-label="Monthly repeat mode"
              >
                <option value="date">On the same date</option>
                <option value="weekday">On the same weekday</option>
              </select>
            </div>
          )}

          <div className="repeat__row">
            <span className="repeat__inline-label">Count from</span>
            <select
              className="field"
              value={rule.from}
              onChange={(e) => patch({ from: e.target.value })}
              aria-label="Count the next occurrence from"
            >
              <option value="due">the scheduled date</option>
              <option value="completion">the day I finish it</option>
            </select>
          </div>

          <div className="repeat__row">
            <span className="repeat__inline-label">Ends</span>
            <select
              className="field"
              value={rule.ends.type}
              onChange={(e) => {
                const type = e.target.value;
                if (type === "never") patch({ ends: { type: "never" } });
                else if (type === "on") patch({ ends: { type: "on", date: rule.ends.date || anchorDate || "" } });
                else patch({ ends: { type: "after", count: rule.ends.count || 10 } });
              }}
              aria-label="Repeat ends"
            >
              <option value="never">never</option>
              <option value="on">on a date</option>
              <option value="after">after N times</option>
            </select>

            {rule.ends.type === "on" && (
              <input
                className="field"
                type="date"
                value={rule.ends.date || ""}
                min={anchorDate || undefined}
                onChange={(e) => patch({ ends: { type: "on", date: e.target.value } })}
                aria-label="Repeat until"
              />
            )}
            {rule.ends.type === "after" && (
              <>
                <input
                  className="field repeat__interval"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="999"
                  value={rule.ends.count}
                  onChange={(e) => patch({ ends: { type: "after", count: e.target.value } })}
                  aria-label="Number of occurrences"
                />
                <span className="repeat__inline-label">times</span>
              </>
            )}
          </div>
        </>
      )}

      {rule && !compact && (
        <div className="repeat__summary">
          <Repeat size={13} />
          <span>
            {describeRule(rule, anchorDate)}
            {!anchorDate && ". Add a due date — a repeat needs a first date to count from."}
          </span>
        </div>
      )}
    </div>
  );
}
