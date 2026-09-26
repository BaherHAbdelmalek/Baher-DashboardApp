// Everything here works on plain YYYY-MM-DD strings, which is what the
// database stores and what <input type="date"> speaks.

/** Today, in the *viewer's own* timezone.
 *
 *  The previous version used `new Date().toISOString().slice(0,10)`, which is
 *  UTC — so anyone west of Greenwich saw tomorrow's date all evening (and
 *  anyone far east saw yesterday's in the morning). That made "Today" badges,
 *  the Today smart list and overdue counts wrong for part of every day. */
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diffDaysFrom(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [ty, tm, td] = todayStr().split("-").map(Number);
  // Compare as UTC midnights so DST transitions can't shift the result.
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
}

function asLocalDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** { text, tone } for the little pill on the right of a row.
 *  `tone` maps to a CSS class rather than a hard-coded hex, so it follows the
 *  light/dark theme. */
export function dateBadge(dateStr, pastLabel) {
  if (!dateStr) return { text: "No date", tone: "none" };
  const diff = diffDaysFrom(dateStr);
  if (diff < 0) return { text: `${pastLabel} ${Math.abs(diff)}d`, tone: "now" };
  if (diff === 0) return { text: "Today", tone: "now" };
  if (diff === 1) return { text: "Tomorrow", tone: "soon" };
  if (diff < 7) return { text: asLocalDate(dateStr).toLocaleDateString(undefined, { weekday: "short" }), tone: "soon" };
  const opts = { month: "short", day: "numeric" };
  if (diff > 300) opts.year = "numeric";
  return { text: asLocalDate(dateStr).toLocaleDateString(undefined, opts), tone: "later" };
}

export function groupLabel(dateStr, pastLabel) {
  if (!dateStr) return "No date";
  const diff = diffDaysFrom(dateStr);
  if (diff < 0) return pastLabel;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return "This Week";
  if (diff < 31) return "This Month";
  return "Later";
}

export function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export const PRIORITY = {
  none: { label: "None", mark: "" },
  low: { label: "Low", mark: "!" },
  medium: { label: "Medium", mark: "!!" },
  high: { label: "High", mark: "!!!" },
};
export const PRIORITY_ORDER = ["none", "low", "medium", "high"];
