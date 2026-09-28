import { useState } from "react";
import { Check, X } from "lucide-react";

// A real <select> dropdown (works everywhere, including iPhone Safari) with
// a built-in "add a new one" option — <datalist> looks fine on desktop but
// iOS Safari doesn't show its suggestions at all, so it silently degrades to
// a plain text box there.
export default function CategorySelect({ value, onChange, projects }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function commit() {
    if (draft.trim()) onChange(draft.trim());
    setAdding(false);
    setDraft("");
  }

  if (adding) {
    return (
      <div className="repeat__row">
        <input
          className="field"
          style={{ flex: 1 }}
          placeholder="New category"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Inside a <form>, Enter would otherwise submit the whole thing.
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setAdding(false); setDraft(""); }
          }}
          autoFocus
          aria-label="New category name"
        />
        <button type="button" className="iconbtn" onClick={commit} aria-label="Save category">
          <Check size={16} />
        </button>
        <button
          type="button"
          className="iconbtn"
          onClick={() => { setAdding(false); setDraft(""); }}
          aria-label="Cancel"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  const options = value && !projects.includes(value) ? [...projects, value] : projects;

  return (
    <select
      className="field"
      value={value}
      onChange={(e) => {
        if (e.target.value === "__add__") setAdding(true);
        else onChange(e.target.value);
      }}
      aria-label="Category"
    >
      {options.map((p) => <option key={p} value={p}>{p}</option>)}
      <option value="__add__">+ Add new category…</option>
    </select>
  );
}
