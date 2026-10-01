import { Sun, Moon, Monitor } from "lucide-react";

const OPTIONS = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "system", label: "Auto", Icon: Monitor },
  { id: "dark", label: "Dark", Icon: Moon },
];

/** All three theme choices at once.
 *
 *  This used to be a single button that cycled system → light → dark. You
 *  couldn't tell what it would do without pressing it, and you couldn't tell
 *  which mode you were in without decoding the icon. Three segments show the
 *  current state and let you pick dark in one press — on a desktop too, where
 *  the machine may well be set to light. */
export default function ThemeToggle({ theme, onPick, showLabels = false }) {
  return (
    <div className={`seg${showLabels ? "" : " seg--icons"}`} role="group" aria-label="Colour theme">
      {OPTIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`seg__btn${theme === id ? " seg__btn--on" : ""}`}
          onClick={() => onPick(id)}
          aria-pressed={theme === id}
          title={id === "system" ? "Match my device" : label}
        >
          <Icon size={15} aria-hidden="true" />
          {showLabels && label}
          {!showLabels && <span className="sr-only">{label}</span>}
        </button>
      ))}
    </div>
  );
}
