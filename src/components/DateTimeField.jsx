/** A native date or time input with a placeholder that actually shows up.
 *
 *  iOS Safari renders an empty <input type="date"> as a completely blank box —
 *  no "mm/dd/yyyy" hint, nothing — so an unset due date looked like a broken
 *  empty field. Chrome shows a hint but in its own US-centric wording. This
 *  paints one placeholder behind the control so every platform reads the same,
 *  and index.css hides the browser's own hint when we're showing ours.
 *
 *  The native picker is kept rather than replaced: it's the control people
 *  already know, and on a phone it's the one that brings up the proper wheel. */
export default function DateTimeField({ type = "date", value, onChange, placeholder, ariaLabel, min }) {
  const empty = !value;
  return (
    <div className={`datefield${empty ? " datefield--empty" : ""}`}>
      <input
        className="field"
        type={type}
        value={value || ""}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
      />
      {empty && <span className="datefield__ph">{placeholder}</span>}
    </div>
  );
}
