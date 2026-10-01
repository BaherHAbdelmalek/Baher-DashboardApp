import { useState } from "react";
import {
  Plus, Trash2, Check, RotateCcw, ChevronDown, ChevronUp, Flag, X,
  Repeat, SkipForward, StickyNote, ListChecks, Sliders,
} from "lucide-react";
import { dateBadge, groupLabel, formatTime, todayStr, PRIORITY, PRIORITY_ORDER } from "../lib/dates";
import { useMediaQuery } from "../lib/useMediaQuery";
import { advance, normalizeRule, shortRuleLabel, describeRule } from "../lib/recurrence";
import CategorySelect from "./CategorySelect";
import RepeatPicker from "./RepeatPicker";
import DateTimeField from "./DateTimeField";

const SMART_VIEWS = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "scheduled", label: "Scheduled" },
  { id: "flagged", label: "Flagged" },
  { id: "repeating", label: "Repeating" },
];

function inSmartView(item, view) {
  if (view === "flagged") return !!item.flagged;
  if (view === "today") return !!item.due_date && item.due_date <= todayStr();
  if (view === "scheduled") return !!item.due_date;
  if (view === "repeating") return !!normalizeRule(item.repeat_rule);
  return true; // 'all'
}

function subtaskProgress(item) {
  const subs = item.subtasks || [];
  if (subs.length === 0) return null;
  return `${subs.filter((s) => s.done).length}/${subs.length}`;
}

const EMPTY_HINTS = {
  all: "Nothing here yet. Add your first one above.",
  today: "Nothing due today. Enjoy it.",
  scheduled: "Nothing has a date yet.",
  flagged: "Nothing flagged.",
  repeating: "No repeating items yet. Set “Repeat” when you add one, or open an existing one and choose an interval.",
};

export default function ListSection({
  icon: Icon,
  title,
  pastLabel,
  items,
  insert,
  update,
  remove,
  projects,
  excludedProjects,
  showDone,
}) {
  // On a 390px-wide phone a title, a date pill and four buttons cannot share a
  // line without the title breaking mid-word. There, the pill moves down into
  // the meta line and the secondary actions move into the detail panel.
  const isPhone = useMediaQuery("(max-width: 719px)");

  const [smartView, setSmartView] = useState("all");
  const [expanded, setExpanded] = useState(() => new Set());
  const [showDetails, setShowDetails] = useState(false);
  const [form, setForm] = useState({
    title: "",
    project: projects[0] || "Other",
    date: "",
    time: "",
    priority: "none",
    repeat: null,
  });

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function addItem(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    insert({
      title: form.title.trim(),
      project: form.project,
      due_date: form.date || null,
      due_time: form.time || null,
      priority: form.priority,
      flagged: false,
      notes: null,
      subtasks: [],
      // A repeat with no first date has nothing to count from, so it's dropped
      // rather than stored as a rule that can never produce an occurrence.
      repeat_rule: form.date ? form.repeat : null,
      status: "todo",
    });
    setForm((f) => ({ ...f, title: "", date: "", time: "", priority: "none", repeat: null }));
  }

  /** Completing a repeating item closes out this occurrence and opens the next
   *  one as a fresh row, so your history stays intact and the series rolls on.
   *  This is the Apple Reminders model: an unfinished occurrence stays put and
   *  goes overdue rather than silently skipping ahead. */
  function toggleDone(item) {
    if (item.status === "done") {
      update(item.id, { status: "todo" });
      return;
    }
    const rule = normalizeRule(item.repeat_rule);
    const next = rule ? advance(item, todayStr(), "complete") : null;

    update(item.id, { status: "done", repeat_rule: next ? next.rule : rule });
    if (next) {
      insert({
        title: item.title,
        project: item.project,
        due_date: next.nextDate,
        due_time: item.due_time,
        priority: item.priority,
        flagged: item.flagged,
        notes: item.notes,
        // Subtasks come back unticked — the next occurrence is a fresh run.
        subtasks: (item.subtasks || []).map((s) => ({ ...s, done: false })),
        repeat_rule: next.rule,
        status: "todo",
      });
    }
  }

  /** Move a repeating item to its next date without marking it done — for the
   *  week you genuinely skip rather than complete. Doesn't spend an occurrence
   *  from an "after N times" budget. */
  function skipOccurrence(item) {
    const next = advance(item, todayStr(), "skip");
    if (!next) {
      update(item.id, { repeat_rule: null });
      return;
    }
    update(item.id, { due_date: next.nextDate, repeat_rule: next.rule });
  }

  function toggleFlag(item) { update(item.id, { flagged: !item.flagged }); }

  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function confirmRemove(item) {
    const series = normalizeRule(item.repeat_rule)
      ? "\n\nThis is a repeating item. Deleting it also ends the series — no further occurrences will be created."
      : "";
    if (window.confirm(`Delete “${item.title}”?${series}`)) remove(item.id);
  }

  const baseVisible = items.filter(
    (i) => (showDone || i.status !== "done") && !excludedProjects.has(i.project)
  );
  const smartVisible = baseVisible.filter((i) => i.status === "done" || inSmartView(i, smartView));

  const sortKey = (i) => i.due_date + "T" + (i.due_time || "00:00");
  const withDate = smartVisible.filter((i) => i.due_date).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const noDate = smartVisible.filter((i) => !i.due_date);
  const ordered = [...withDate, ...noDate].filter((i) => i.status !== "done");
  const doneItems = smartVisible.filter((i) => i.status === "done");

  const counts = SMART_VIEWS.reduce((acc, v) => {
    acc[v.id] = baseVisible.filter((i) => i.status !== "done" && inSmartView(i, v.id)).length;
    return acc;
  }, {});

  let lastGroup = null;

  return (
    <section>
      <div className="section__header">
        <Icon size={17} aria-hidden="true" />
        <h2 style={{ font: "inherit", margin: 0 }}>{title}</h2>
        <span className="section__count">{ordered.length} open</span>
      </div>

      <div className={`seg${isPhone ? " seg--scroll" : ""}`} role="tablist" aria-label={`${title} views`}>
        {SMART_VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={smartView === v.id}
            className={`seg__btn${smartView === v.id ? " seg__btn--on" : ""}`}
            onClick={() => setSmartView(v.id)}
          >
            {v.label}
            {counts[v.id] > 0 && <span className="seg__count">{counts[v.id]}</span>}
          </button>
        ))}
      </div>

      <form onSubmit={addItem} className="addform">
        <div className="addform__top">
          <input
            className="field"
            placeholder={`Add to ${title.split(" ")[0].toLowerCase()}…`}
            value={form.title}
            onChange={(e) => setField("title", e.target.value)}
            aria-label="Title"
          />
          <button className="btn btn--primary" type="submit" disabled={!form.title.trim()}>
            <Plus size={17} aria-hidden="true" />
            <span className="hide-phone">Add</span>
          </button>
        </div>

        <button
          type="button"
          className="addform__detailsbtn"
          onClick={() => setShowDetails((s) => !s)}
          aria-expanded={showDetails}
        >
          <Sliders size={13} aria-hidden="true" />
          {showDetails ? "Hide details" : "Date, priority, repeat…"}
          {showDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {showDetails && (
          <div className="addform__grid">
            <div className="field-group field-group--full">
              <label className="field-label" htmlFor={`${title}-date`}>Due date</label>
              <input
                id={`${title}-date`}
                className="field"
                type="date"
                value={form.date}
                onChange={(v) => setField("date", v)}
                placeholder="No date"
                ariaLabel="Due date"
              />
            </div>
            <div className="field-group field-group--full">
              <label className="field-label" htmlFor={`${title}-time`}>Time</label>
              <input
                id={`${title}-time`}
                className="field"
                type="time"
                value={form.time}
                onChange={(v) => setField("time", v)}
                placeholder="No time"
                ariaLabel="Due time"
              />
            </div>
            <div className="field-group field-group--compact">
              <label className="field-label" htmlFor={`${title}-priority`}>Priority</label>
              <select
                id={`${title}-priority`}
                className="field"
                value={form.priority}
                onChange={(e) => setField("priority", e.target.value)}
              >
                {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
              </select>
            </div>
            <div className="field-group field-group--compact">
              <span className="field-label">Category</span>
              <CategorySelect value={form.project} onChange={(v) => setField("project", v)} projects={projects} />
            </div>
            <div className="field-group field-group--wide">
              <span className="field-label">Repeat</span>
              <RepeatPicker
                value={form.repeat}
                onChange={(r) => setField("repeat", r)}
                anchorDate={form.date}
              />
            </div>
          </div>
        )}
      </form>

      <div className="list">
        {ordered.length === 0 && <div className="empty">{EMPTY_HINTS[smartView]}</div>}
        {ordered.map((item) => {
          const g = groupLabel(item.due_date, pastLabel);
          const showHeader = g !== lastGroup;
          lastGroup = g;
          const badge = dateBadge(item.due_date, pastLabel);
          const isOpen = expanded.has(item.id);
          const progress = subtaskProgress(item);
          const rule = normalizeRule(item.repeat_rule);
          const repeatLabel = shortRuleLabel(rule);

          return (
            <div key={item.id}>
              {showHeader && <div className="group-header">{g}</div>}
              <div className={`item${isOpen ? " item--open" : ""}`}>
                <button
                  type="button"
                  className="item__check"
                  onClick={() => toggleDone(item)}
                  aria-label={`Mark “${item.title}” done`}
                >
                  <Check size={14} aria-hidden="true" />
                </button>

                <div className="item__body">
                  <div className="item__title">
                    {item.title}
                    {item.priority !== "none" && (
                      <span className={`priority-mark priority-mark--${item.priority}`} aria-label={`${PRIORITY[item.priority].label} priority`}>
                        {PRIORITY[item.priority].mark}
                      </span>
                    )}
                  </div>
                  <div className="item__meta">
                    <span>{item.project}</span>
                    {item.due_time && <span>{formatTime(item.due_time)}</span>}
                    {repeatLabel && (
                      <span title={describeRule(rule, item.due_date)}>
                        <Repeat size={10} aria-hidden="true" /> {repeatLabel}
                      </span>
                    )}
                    {progress && <span><ListChecks size={10} aria-hidden="true" /> {progress}</span>}
                    {item.notes && <span><StickyNote size={10} aria-hidden="true" /> notes</span>}
                    {isPhone && item.due_date && (
                      <span className={`badge badge--${badge.tone}`}>{badge.text}</span>
                    )}
                  </div>
                </div>

                {!isPhone && item.due_date && (
                  <span className={`badge badge--${badge.tone}`}>{badge.text}</span>
                )}

                <div className="item__actions">
                  {!isPhone && rule && item.due_date && (
                    <button
                      type="button"
                      className="iconbtn"
                      onClick={() => skipOccurrence(item)}
                      aria-label="Skip to next occurrence"
                      title="Skip to next occurrence"
                    >
                      <SkipForward size={15} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    className={`iconbtn${item.flagged ? " iconbtn--on" : ""}`}
                    onClick={() => toggleFlag(item)}
                    aria-label={item.flagged ? "Remove flag" : "Add flag"}
                    aria-pressed={item.flagged}
                  >
                    <Flag size={15} fill={item.flagged ? "currentColor" : "none"} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="iconbtn"
                    onClick={() => toggleExpand(item.id)}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? "Hide details" : "Show details"}
                  >
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {!isPhone && (
                    <button
                      type="button"
                      className="iconbtn iconbtn--danger reveal"
                      onClick={() => confirmRemove(item)}
                      aria-label={`Delete “${item.title}”`}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              {isOpen && (
                <DetailPanel
                  item={item}
                  update={update}
                  projects={projects}
                  canSkip={!!rule && !!item.due_date}
                  onSkip={() => skipOccurrence(item)}
                  onDelete={() => confirmRemove(item)}
                  onClose={() => toggleExpand(item.id)}
                />
              )}
            </div>
          );
        })}
      </div>

      {showDone && doneItems.length > 0 && (
        <div className="done-section">
          <div className="done-section__header">Done · {doneItems.length}</div>
          <div className="list">
            {doneItems.map((item) => (
              <div key={item.id} className="item item--done">
                <button
                  type="button"
                  className="item__check item__check--done"
                  onClick={() => toggleDone(item)}
                  aria-label={`Reopen “${item.title}”`}
                >
                  <RotateCcw size={13} aria-hidden="true" />
                </button>
                <div className="item__body">
                  <div className="item__title item__title--done">{item.title}</div>
                  <div className="item__meta">
                    <span>{item.project}</span>
                    {item.due_date && <span>{item.due_date}</span>}
                  </div>
                </div>
                <div className="item__actions">
                  <button
                    type="button"
                    className="iconbtn iconbtn--danger reveal"
                    onClick={() => confirmRemove(item)}
                    aria-label={`Delete “${item.title}”`}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------------------------------
   Detail panel — the app previously had no way at all to correct a typo or
   move a date once an item existed. Everything is editable here.
   -------------------------------------------------------------------------- */
function DetailPanel({ item, update, projects, canSkip, onSkip, onDelete, onClose }) {
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes || "");
  const [newSubtask, setNewSubtask] = useState("");
  const subtasks = item.subtasks || [];

  function saveTitle() {
    const t = title.trim();
    if (!t) { setTitle(item.title); return; } // an empty title would orphan the row
    if (t !== item.title) update(item.id, { title: t });
  }
  function saveNotes() {
    if (notes !== (item.notes || "")) update(item.id, { notes: notes.trim() || null });
  }

  function addSubtask(e) {
    e.preventDefault();
    if (!newSubtask.trim()) return;
    update(item.id, {
      subtasks: [
        ...subtasks,
        { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: newSubtask.trim(), done: false },
      ],
    });
    setNewSubtask("");
  }
  function toggleSubtask(id) {
    update(item.id, { subtasks: subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });
  }
  function removeSubtask(id) {
    update(item.id, { subtasks: subtasks.filter((s) => s.id !== id) });
  }

  return (
    <div className="detail">
      <div>
        <div className="detail__label">Title</div>
        <input
          className="field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          aria-label="Title"
        />
      </div>

      <div className="detail__grid">
        <div className="field-group field-group--full">
          <span className="field-label">Due date</span>
          <DateTimeField
            value={item.due_date || ""}
            onChange={(v) => update(item.id, { due_date: v || null })}
            placeholder="No date"
            ariaLabel="Due date"
          />
        </div>
        <div className="field-group field-group--full">
          <span className="field-label">Time</span>
          <DateTimeField
            type="time"
            value={item.due_time ? item.due_time.slice(0, 5) : ""}
            onChange={(v) => update(item.id, { due_time: v || null })}
            placeholder="No time"
            ariaLabel="Due time"
          />
        </div>
        <div className="field-group field-group--compact">
          <span className="field-label">Priority</span>
          <select
            className="field"
            value={item.priority || "none"}
            onChange={(e) => update(item.id, { priority: e.target.value })}
          >
            {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
          </select>
        </div>
        <div className="field-group field-group--compact">
          <span className="field-label">Category</span>
          <CategorySelect
            value={item.project}
            onChange={(v) => update(item.id, { project: v })}
            projects={projects}
          />
        </div>
      </div>

      <div>
        <div className="detail__label">Repeat</div>
        {!item.due_date && (
          <div className="repeat__summary" style={{ marginBottom: 10 }}>
            <Repeat size={13} aria-hidden="true" />
            <span>Set a due date first — a repeat needs a date to count from.</span>
          </div>
        )}
        <RepeatPicker
          value={item.repeat_rule}
          onChange={(r) => update(item.id, { repeat_rule: r })}
          anchorDate={item.due_date || ""}
        />
      </div>

      <div>
        <div className="detail__label">Notes</div>
        <textarea
          className="field"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Add notes…"
          aria-label="Notes"
        />
      </div>

      <div>
        <div className="detail__label">Subtasks</div>
        {subtasks.map((s) => (
          <div key={s.id} className="subtask">
            <button
              type="button"
              className={`subtask__check${s.done ? " subtask__check--done" : ""}`}
              onClick={() => toggleSubtask(s.id)}
              aria-label={`${s.done ? "Untick" : "Tick"} “${s.title}”`}
              aria-pressed={s.done}
            >
              <Check size={12} aria-hidden="true" />
            </button>
            <span className={`subtask__title${s.done ? " subtask__title--done" : ""}`}>{s.title}</span>
            <button
              type="button"
              className="iconbtn iconbtn--danger"
              onClick={() => removeSubtask(s.id)}
              aria-label={`Delete subtask “${s.title}”`}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
        <form onSubmit={addSubtask} className="subtask__add">
          <input
            className="field"
            placeholder="Add subtask…"
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            aria-label="New subtask"
          />
          <button type="submit" className="btn" disabled={!newSubtask.trim()}>Add</button>
        </form>
      </div>

      <div className="detail__footer">
        <button type="button" className="btn" onClick={onClose}>
          <ChevronUp size={14} aria-hidden="true" /> Close
        </button>
        {canSkip && (
          <button type="button" className="btn" onClick={onSkip}>
            <SkipForward size={14} aria-hidden="true" /> Skip this one
          </button>
        )}
        <button type="button" className="btn btn--danger push-right" onClick={onDelete}>
          <Trash2 size={14} aria-hidden="true" /> Delete
        </button>
      </div>
    </div>
  );
}
