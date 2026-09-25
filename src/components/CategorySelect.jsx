import { useState } from "react";
import { styles } from "../styles";

// A real <select> dropdown (works everywhere, including iPhone Safari) with
// a built-in "add a new one" option — <datalist> looks fine on desktop but
// iOS Safari doesn't show its suggestions at all, so it silently degrades to
// a plain text box there.
export default function CategorySelect({ value, onChange, projects }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  if (adding) {
    return (
      <div style={styles.categoryAddRow}>
        <input
          className="bh-input"
          style={styles.projectInput}
          placeholder="New category name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        />
        <button
          type="button"
          style={styles.subtaskAddBtn}
          onClick={() => {
            if (draft.trim()) onChange(draft.trim());
            setAdding(false);
            setDraft("");
          }}
        >
          Add
        </button>
        <button type="button" style={styles.subtaskAddBtn} onClick={() => { setAdding(false); setDraft(""); }}>
          Cancel
        </button>
      </div>
    );
  }

  const options = value && !projects.includes(value) ? [...projects, value] : projects;

  return (
    <select
      className="bh-select"
      style={styles.projectInput}
      value={value}
      onChange={(e) => {
        if (e.target.value === "__add__") setAdding(true);
        else onChange(e.target.value);
      }}
    >
      {options.map((p) => <option key={p} value={p}>{p}</option>)}
      <option value="__add__">+ Add new category…</option>
    </select>
  );
}
