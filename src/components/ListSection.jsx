import { useState } from "react";
import { Plus, Trash2, Check, RotateCcw, ChevronDown, ChevronRight, Flag, X } from "lucide-react";
import { styles } from "../styles";
import { dateBadge, groupLabel, formatTime, todayStr, PRIORITY, PRIORITY_ORDER } from "../lib/dates";
import CategorySelect from "./CategorySelect";

const SMART_VIEWS = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "scheduled", label: "Scheduled" },
  { id: "flagged", label: "Flagged" },
];

function inSmartView(item, view) {
  if (view === "flagged") return !!item.flagged;
  if (view === "today") return item.due_date === todayStr();
  if (view === "scheduled") return !!item.due_date;
  return true; // 'all'
}

function subtaskProgress(item) {
  const subs = item.subtasks || [];
  if (subs.length === 0) return null;
  const done = subs.filter((s) => s.done).length;
  return `${done}/${subs.length}`;
}

export default function ListSection({
  icon: Icon,
  title,
  pastLabel,
  items,
  insert,
  update,
  remove,
  projects,
  filterProject,
  showDone,
}) {
  const [smartView, setSmartView] = useState("all");
  const [expanded, setExpanded] = useState(() => new Set());
  const [formTitle, setFormTitle] = useState("");
  const [formProject, setFormProject] = useState(projects[0] || "Other");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formPriority, setFormPriority] = useState("none");

  function addItem(e) {
    e.preventDefault();
    if (!formTitle.trim()) return;
    insert({
      title: formTitle.trim(),
      project: formProject,
      due_date: formDate || null,
      due_time: formTime || null,
      priority: formPriority,
      flagged: false,
      notes: null,
      subtasks: [],
      status: "todo",
    });
    setFormTitle(""); setFormDate(""); setFormTime(""); setFormPriority("none");
  }

  function toggleDone(item) {
    update(item.id, { status: item.status === "done" ? "todo" : "done" });
  }
  function toggleFlag(item) {
    update(item.id, { flagged: !item.flagged });
  }
  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const baseVisible = items.filter(
    (i) => (showDone || i.status !== "done") && (filterProject === "all" || i.project === filterProject)
  );
  const smartVisible = baseVisible.filter((i) => i.status === "done" || inSmartView(i, smartView));

  const withDate = smartVisible.filter((i) => i.due_date).sort((a, b) => (a.due_date + (a.due_time || "00:00")).localeCompare(b.due_date + (b.due_time || "00:00")));
  const noDate = smartVisible.filter((i) => !i.due_date);
  const ordered = [...withDate, ...noDate].filter((i) => i.status !== "done");
  const doneItems = smartVisible.filter((i) => i.status === "done");

  const counts = SMART_VIEWS.reduce((acc, v) => {
    acc[v.id] = baseVisible.filter((i) => i.status !== "done" && inSmartView(i, v.id)).length;
    return acc;
  }, {});

  let lastGroup = null;

  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <Icon size={16} />
        <span>{title}</span>
        <span style={styles.sectionCount}>{ordered.length} open</span>
      </div>

      <div style={styles.smartBar}>
        {SMART_VIEWS.map((v) => (
          <button
            key={v.id}
            className="bh-chip"
            style={{ ...styles.smartBtn, ...(smartView === v.id ? styles.smartBtnActive : {}) }}
            onClick={() => setSmartView(v.id)}
          >
            {v.label} <span style={styles.smartCount}>{counts[v.id]}</span>
          </button>
        ))}
      </div>

      <form onSubmit={addItem} style={styles.form}>
        <div style={styles.fieldGroup}>
          <label style={styles.fieldLabel}>Title</label>
          <input className="bh-input" style={styles.textInput} placeholder="Add…" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.fieldLabel}>Category</label>
          <CategorySelect value={formProject} onChange={setFormProject} projects={projects} />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.fieldLabel}>Due date</label>
          <input className="bh-input" type="date" style={styles.dateInput} value={formDate} onChange={(e) => setFormDate(e.target.value)} />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.fieldLabel}>Time</label>
          <input className="bh-input" type="time" style={styles.timeInput} value={formTime} onChange={(e) => setFormTime(e.target.value)} />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.fieldLabel}>Priority</label>
          <select className="bh-select" style={styles.prioritySelect} value={formPriority} onChange={(e) => setFormPriority(e.target.value)}>
            {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
          </select>
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.fieldLabel}>&nbsp;</label>
          <button className="bh-btn" type="submit" style={styles.addBtn}><Plus size={16} /> Add</button>
        </div>
      </form>

      <div style={styles.listBody}>
        {ordered.length === 0 && <div style={styles.empty}>Nothing here.</div>}
        {ordered.map((item) => {
          const g = groupLabel(item.due_date, pastLabel);
          const showHeader = smartView !== "today" && g !== lastGroup;
          lastGroup = g;
          const badge = dateBadge(item.due_date, pastLabel);
          const isOpen = expanded.has(item.id);
          const progress = subtaskProgress(item);
          return (
            <div key={item.id}>
              {showHeader && <div style={styles.groupHeader}>{g}</div>}
              <div className="bh-task" style={styles.taskCard}>
                <button style={styles.checkBtn} onClick={() => toggleDone(item)} aria-label="Mark done"><Check size={13} /></button>
                <div style={styles.taskBody}>
                  <div style={styles.taskTitle}>
                    {item.title}
                    {item.priority !== "none" && (
                      <span style={{ ...styles.priorityTag, color: PRIORITY[item.priority].color }}>{PRIORITY[item.priority].mark}</span>
                    )}
                  </div>
                  <div style={styles.taskMeta}>
                    {item.project}
                    {item.due_time ? ` · ${formatTime(item.due_time)}` : ""}
                    {progress ? ` · ${progress} subtasks` : ""}
                    {item.notes ? " · has notes" : ""}
                  </div>
                </div>
                {item.due_date && <span style={{ ...styles.badge, color: badge.color, borderColor: badge.color }}>{badge.text}</span>}
                <button
                  style={{ ...styles.flagBtn, ...(item.flagged ? styles.flagBtnActive : {}) }}
                  onClick={() => toggleFlag(item)}
                  aria-label="Toggle flag"
                >
                  <Flag size={14} fill={item.flagged ? "currentColor" : "none"} />
                </button>
                <button style={styles.expandBtn} onClick={() => toggleExpand(item.id)} aria-label="Expand">
                  {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
                <button className="bh-del" style={styles.delBtn} onClick={() => remove(item.id)} aria-label="Delete"><Trash2 size={13} /></button>
              </div>
              {isOpen && <ExpandedPanel item={item} update={update} />}
            </div>
          );
        })}
      </div>

      {showDone && doneItems.length > 0 && (
        <div style={styles.doneSection}>
          <div style={styles.doneHeader}>Done</div>
          {doneItems.map((item) => (
            <div key={item.id} className="bh-task" style={{ ...styles.taskCard, ...styles.taskDone }}>
              <button style={styles.checkBtn} onClick={() => toggleDone(item)} aria-label="Reopen"><RotateCcw size={13} /></button>
              <div style={styles.taskBody}>
                <div style={{ ...styles.taskTitle, textDecoration: "line-through", color: "#8A8F98" }}>{item.title}</div>
                <div style={styles.taskMeta}>{item.project}</div>
              </div>
              <button className="bh-del" style={styles.delBtn} onClick={() => remove(item.id)} aria-label="Delete"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ExpandedPanel({ item, update }) {
  const [notes, setNotes] = useState(item.notes || "");
  const [newSubtask, setNewSubtask] = useState("");
  const subtasks = item.subtasks || [];

  function saveNotes() {
    if (notes !== (item.notes || "")) update(item.id, { notes: notes.trim() || null });
  }

  function addSubtask(e) {
    e.preventDefault();
    if (!newSubtask.trim()) return;
    const next = [...subtasks, { id: Date.now().toString(36), title: newSubtask.trim(), done: false }];
    update(item.id, { subtasks: next });
    setNewSubtask("");
  }
  function toggleSubtask(id) {
    const next = subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s));
    update(item.id, { subtasks: next });
  }
  function removeSubtask(id) {
    update(item.id, { subtasks: subtasks.filter((s) => s.id !== id) });
  }

  return (
    <div style={styles.expandedPanel}>
      <div>
        <div style={styles.subtaskLabel}>Notes</div>
        <textarea
          className="bh-input"
          style={styles.notesArea}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Add notes…"
        />
      </div>
      <div>
        <div style={styles.subtaskLabel}>Subtasks</div>
        {subtasks.map((s) => (
          <div key={s.id} style={styles.subtaskRow}>
            <button style={styles.subtaskCheck} onClick={() => toggleSubtask(s.id)} aria-label="Toggle subtask">
              {s.done && <Check size={10} />}
            </button>
            <div style={{ ...styles.subtaskTitle, ...(s.done ? { textDecoration: "line-through", color: "#B0B4BA" } : {}) }}>
              {s.title}
            </div>
            <button className="bh-del" style={{ ...styles.delBtn, opacity: 1 }} onClick={() => removeSubtask(s.id)} aria-label="Delete subtask">
              <X size={12} />
            </button>
          </div>
        ))}
        <form onSubmit={addSubtask} style={styles.subtaskAddRow}>
          <input
            className="bh-input"
            style={styles.subtaskAddInput}
            placeholder="Add subtask…"
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
          />
          <button type="submit" style={styles.subtaskAddBtn}>Add</button>
        </form>
      </div>
    </div>
  );
}
