import { useState } from "react";
import {
  Plus, Trash2, Check, RotateCcw, Calendar, MapPin, Repeat,
  SkipForward, ChevronDown, ChevronUp, Sliders,
} from "lucide-react";
import { dateBadge, groupLabel, formatTime, todayStr } from "../lib/dates";
import { useMediaQuery } from "../lib/useMediaQuery";
import { advance, normalizeRule, shortRuleLabel, describeRule } from "../lib/recurrence";
import CategorySelect from "./CategorySelect";
import RepeatPicker from "./RepeatPicker";

export default function MeetingsSection({ items, insert, update, remove, projects, excludedProjects, showDone }) {
  // See ListSection: a phone row can't fit title + date pill + four buttons.
  const isPhone = useMediaQuery("(max-width: 719px)");
  const [showDetails, setShowDetails] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const [form, setForm] = useState({
    title: "",
    project: projects[0] || "Other",
    date: "",
    time: "",
    location: "",
    repeat: null,
  });

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function addMeeting(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    insert({
      title: form.title.trim(),
      project: form.project,
      date: form.date || null,
      time: form.time || null,
      location: form.location.trim() || null,
      repeat_rule: form.date ? form.repeat : null,
      status: "upcoming",
    });
    setForm((f) => ({ ...f, title: "", date: "", time: "", location: "", repeat: null }));
  }

  function toggleDone(m) {
    if (m.status === "done") {
      update(m.id, { status: "upcoming" });
      return;
    }
    const rule = normalizeRule(m.repeat_rule);
    const next = rule ? advance(m, todayStr(), "complete") : null;
    update(m.id, { status: "done", repeat_rule: next ? next.rule : rule });
    if (next) {
      insert({
        title: m.title,
        project: m.project,
        date: next.nextDate,
        time: m.time,
        location: m.location,
        repeat_rule: next.rule,
        status: "upcoming",
      });
    }
  }

  function skipOccurrence(m) {
    const next = advance(m, todayStr(), "skip");
    if (!next) { update(m.id, { repeat_rule: null }); return; }
    // notified_at is cleared so the reminder fires for the new slot too.
    update(m.id, { date: next.nextDate, repeat_rule: next.rule, notified_at: null });
  }

  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function confirmRemove(m) {
    const series = normalizeRule(m.repeat_rule)
      ? "\n\nThis is a repeating meeting. Deleting it also ends the series."
      : "";
    if (window.confirm(`Delete “${m.title}”?${series}`)) remove(m.id);
  }

  const visible = items.filter(
    (m) => (showDone || m.status !== "done") && !excludedProjects.has(m.project)
  );
  const sortKey = (m) => m.date + "T" + (m.time || "00:00");
  const withDate = visible.filter((m) => m.date).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const noDate = visible.filter((m) => !m.date);
  const ordered = [...withDate, ...noDate].filter((m) => m.status !== "done");
  const doneItems = visible.filter((m) => m.status === "done");

  let lastGroup = null;

  return (
    <section>
      <div className="section__header">
        <Calendar size={17} aria-hidden="true" />
        <h2 style={{ font: "inherit", margin: 0 }}>Meetings &amp; Appointments</h2>
        <span className="section__count">{ordered.length} upcoming</span>
      </div>

      <form onSubmit={addMeeting} className="addform">
        <div className="addform__top">
          <input
            className="field"
            placeholder="Meeting or appointment…"
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
          {showDetails ? "Hide details" : "Date, location, repeat…"}
          {showDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {showDetails && (
          <div className="addform__grid">
            <div className="field-group field-group--full">
              <label className="field-label" htmlFor="meeting-date">Date</label>
              <input id="meeting-date" className="field" type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} />
            </div>
            <div className="field-group field-group--full">
              <label className="field-label" htmlFor="meeting-time">Time</label>
              <input id="meeting-time" className="field" type="time" value={form.time} onChange={(e) => setField("time", e.target.value)} />
            </div>
            <div className="field-group field-group--compact">
              <label className="field-label" htmlFor="meeting-loc">Location</label>
              <input id="meeting-loc" className="field" placeholder="Optional" value={form.location} onChange={(e) => setField("location", e.target.value)} />
            </div>
            <div className="field-group field-group--compact">
              <span className="field-label">Category</span>
              <CategorySelect value={form.project} onChange={(v) => setField("project", v)} projects={projects} />
            </div>
            <div className="field-group field-group--wide">
              <span className="field-label">Repeat</span>
              <RepeatPicker value={form.repeat} onChange={(r) => setField("repeat", r)} anchorDate={form.date} />
            </div>
          </div>
        )}
      </form>

      <div className="list">
        {ordered.length === 0 && <div className="empty">Nothing scheduled. Add a meeting above.</div>}
        {ordered.map((m) => {
          const g = groupLabel(m.date, "Past");
          const showHeader = g !== lastGroup;
          lastGroup = g;
          const badge = dateBadge(m.date, "Past");
          const rule = normalizeRule(m.repeat_rule);
          const repeatLabel = shortRuleLabel(rule);
          const isOpen = expanded.has(m.id);

          return (
            <div key={m.id}>
              {showHeader && <div className="group-header">{g}</div>}
              <div className="item">
                <button
                  type="button"
                  className="item__check"
                  onClick={() => toggleDone(m)}
                  aria-label={`Mark “${m.title}” done`}
                >
                  <Check size={14} aria-hidden="true" />
                </button>

                <div className="item__body">
                  <div className="item__title">{m.title}</div>
                  <div className="item__meta">
                    <span>{m.project}</span>
                    {m.time && <span>{formatTime(m.time)}</span>}
                    {m.location && <span><MapPin size={10} aria-hidden="true" /> {m.location}</span>}
                    {repeatLabel && (
                      <span title={describeRule(rule, m.date)}>
                        <Repeat size={10} aria-hidden="true" /> {repeatLabel}
                      </span>
                    )}
                    {isPhone && m.date && (
                      <span className={`badge badge--${badge.tone}`}>{badge.text}</span>
                    )}
                  </div>
                </div>

                {!isPhone && m.date && <span className={`badge badge--${badge.tone}`}>{badge.text}</span>}

                <div className="item__actions">
                  {!isPhone && rule && m.date && (
                    <button
                      type="button"
                      className="iconbtn"
                      onClick={() => skipOccurrence(m)}
                      aria-label="Skip to next occurrence"
                      title="Skip to next occurrence"
                    >
                      <SkipForward size={15} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="iconbtn"
                    onClick={() => toggleExpand(m.id)}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? "Hide details" : "Show details"}
                  >
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {!isPhone && (
                    <button
                      type="button"
                      className="iconbtn iconbtn--danger reveal"
                      onClick={() => confirmRemove(m)}
                      aria-label={`Delete “${m.title}”`}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              {isOpen && (
                <MeetingDetail
                  meeting={m}
                  update={update}
                  projects={projects}
                  canSkip={!!rule && !!m.date}
                  onSkip={() => skipOccurrence(m)}
                  onDelete={() => confirmRemove(m)}
                  onClose={() => toggleExpand(m.id)}
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
            {doneItems.map((m) => (
              <div key={m.id} className="item item--done">
                <button
                  type="button"
                  className="item__check item__check--done"
                  onClick={() => toggleDone(m)}
                  aria-label={`Reopen “${m.title}”`}
                >
                  <RotateCcw size={13} aria-hidden="true" />
                </button>
                <div className="item__body">
                  <div className="item__title item__title--done">{m.title}</div>
                  <div className="item__meta">
                    <span>{m.project}</span>
                    {m.date && <span>{m.date}</span>}
                  </div>
                </div>
                <div className="item__actions">
                  <button
                    type="button"
                    className="iconbtn iconbtn--danger reveal"
                    onClick={() => confirmRemove(m)}
                    aria-label={`Delete “${m.title}”`}
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

function MeetingDetail({ meeting: m, update, projects, canSkip, onSkip, onDelete, onClose }) {
  const [title, setTitle] = useState(m.title);
  const [location, setLocation] = useState(m.location || "");

  function saveTitle() {
    const t = title.trim();
    if (!t) { setTitle(m.title); return; }
    if (t !== m.title) update(m.id, { title: t });
  }
  function saveLocation() {
    const l = location.trim() || null;
    if (l !== (m.location || null)) update(m.id, { location: l });
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
          <span className="field-label">Date</span>
          <input
            className="field"
            type="date"
            value={m.date || ""}
            // Moving the meeting re-arms its 30-minute heads-up.
            onChange={(e) => update(m.id, { date: e.target.value || null, notified_at: null })}
          />
        </div>
        <div className="field-group field-group--full">
          <span className="field-label">Time</span>
          <input
            className="field"
            type="time"
            value={m.time ? m.time.slice(0, 5) : ""}
            onChange={(e) => update(m.id, { time: e.target.value || null, notified_at: null })}
          />
        </div>
        <div className="field-group field-group--compact">
          <span className="field-label">Location</span>
          <input
            className="field"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onBlur={saveLocation}
            placeholder="Optional"
          />
        </div>
        <div className="field-group field-group--compact">
          <span className="field-label">Category</span>
          <CategorySelect value={m.project} onChange={(v) => update(m.id, { project: v })} projects={projects} />
        </div>
      </div>

      <div>
        <div className="detail__label">Repeat</div>
        {!m.date && (
          <div className="repeat__summary" style={{ marginBottom: 10 }}>
            <Repeat size={13} aria-hidden="true" />
            <span>Set a date first — a repeat needs a date to count from.</span>
          </div>
        )}
        <RepeatPicker
          value={m.repeat_rule}
          onChange={(r) => update(m.id, { repeat_rule: r })}
          anchorDate={m.date || ""}
        />
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
