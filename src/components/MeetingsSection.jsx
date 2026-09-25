import { useState } from "react";
import { Plus, Trash2, Check, RotateCcw, Calendar, MapPin } from "lucide-react";
import { styles } from "../styles";
import { dateBadge, groupLabel, formatTime } from "../lib/dates";
import CategorySelect from "./CategorySelect";

export default function MeetingsSection({ items, insert, update, remove, projects, filterProject, showDone }) {
  const [title, setTitle] = useState("");
  const [project, setProject] = useState(projects[0] || "Other");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");

  function addMeeting(e) {
    e.preventDefault();
    if (!title.trim()) return;
    insert({
      title: title.trim(),
      project,
      date: date || null,
      time: time || null,
      location: location.trim() || null,
      status: "upcoming",
    });
    setTitle(""); setDate(""); setTime(""); setLocation("");
  }
  function toggleDone(m) {
    update(m.id, { status: m.status === "done" ? "upcoming" : "done" });
  }

  const visible = items.filter(
    (m) => (showDone || m.status !== "done") && (filterProject === "all" || m.project === filterProject)
  );
  const withDate = visible.filter((m) => m.date).sort((a, b) => (a.date + (a.time || "00:00")).localeCompare(b.date + (b.time || "00:00")));
  const noDate = visible.filter((m) => !m.date);
  const ordered = [...withDate, ...noDate].filter((m) => m.status !== "done");
  const doneItems = visible.filter((m) => m.status === "done");

  let lastGroup = null;

  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <Calendar size={16} />
        <span>Meetings &amp; Appointments</span>
        <span style={styles.sectionCount}>{ordered.length} upcoming</span>
      </div>

      <form onSubmit={addMeeting} style={styles.form}>
        <div style={styles.fieldGroup}>
          <label style={styles.fieldLabel}>Title</label>
          <input className="bh-input" style={styles.textInput} placeholder="Meeting or appointment…" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.fieldLabel}>Category</label>
          <CategorySelect value={project} onChange={setProject} projects={projects} />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.fieldLabel}>Date</label>
          <input className="bh-input" type="date" style={styles.dateInput} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.fieldLabel}>Time</label>
          <input className="bh-input" type="time" style={styles.timeInput} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.fieldLabel}>Location</label>
          <input className="bh-input" style={styles.locationInput} placeholder="Optional" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.fieldLabel}>&nbsp;</label>
          <button className="bh-btn" type="submit" style={styles.addBtn}><Plus size={16} /> Add</button>
        </div>
      </form>

      <div style={styles.listBody}>
        {ordered.length === 0 && <div style={styles.empty}>Nothing scheduled.</div>}
        {ordered.map((m) => {
          const g = groupLabel(m.date, "Past");
          const showHeader = g !== lastGroup;
          lastGroup = g;
          const badge = dateBadge(m.date, "Past");
          return (
            <div key={m.id}>
              {showHeader && <div style={styles.groupHeader}>{g}</div>}
              <div className="bh-task" style={styles.taskCard}>
                <button style={styles.checkBtn} onClick={() => toggleDone(m)} aria-label="Mark done"><Check size={13} /></button>
                <div style={styles.taskBody}>
                  <div style={styles.taskTitle}>{m.title}</div>
                  <div style={styles.taskMeta}>
                    {m.project}
                    {m.time ? ` · ${formatTime(m.time)}` : ""}
                    {m.location ? (
                      <span style={styles.metaLoc}><MapPin size={10} style={{ verticalAlign: "-1px" }} /> {m.location}</span>
                    ) : null}
                  </div>
                </div>
                <span style={{ ...styles.badge, color: badge.color, borderColor: badge.color }}>{badge.text}</span>
                <button className="bh-del" style={styles.delBtn} onClick={() => remove(m.id)} aria-label="Delete"><Trash2 size={13} /></button>
              </div>
            </div>
          );
        })}
      </div>

      {showDone && doneItems.length > 0 && (
        <div style={styles.doneSection}>
          <div style={styles.doneHeader}>Done</div>
          {doneItems.map((m) => (
            <div key={m.id} className="bh-task" style={{ ...styles.taskCard, ...styles.taskDone }}>
              <button style={styles.checkBtn} onClick={() => toggleDone(m)} aria-label="Reopen"><RotateCcw size={13} /></button>
              <div style={styles.taskBody}>
                <div style={{ ...styles.taskTitle, textDecoration: "line-through", color: "#8A8F98" }}>{m.title}</div>
                <div style={styles.taskMeta}>{m.project}</div>
              </div>
              <button className="bh-del" style={styles.delBtn} onClick={() => remove(m.id)} aria-label="Delete"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
