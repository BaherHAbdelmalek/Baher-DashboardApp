export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function diffDaysFrom(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const t = new Date(todayStr() + "T00:00:00");
  return Math.round((d - t) / 86400000);
}

export function dateBadge(dateStr, pastLabel) {
  if (!dateStr) return { text: "No date", color: "#9CA3AF" };
  const diff = diffDaysFrom(dateStr);
  if (diff < 0) return { text: `${pastLabel} ${Math.abs(diff)}d`, color: "#B5462A" };
  if (diff === 0) return { text: "Today", color: "#B5462A" };
  if (diff === 1) return { text: "Tomorrow", color: "#A8791A" };
  if (diff < 7) {
    const d = new Date(dateStr + "T00:00:00");
    return { text: d.toLocaleDateString(undefined, { weekday: "short" }), color: "#A8791A" };
  }
  const d = new Date(dateStr + "T00:00:00");
  return { text: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), color: "#3E6B52" };
}

export function groupLabel(dateStr, pastLabel) {
  if (!dateStr) return "No date";
  const diff = diffDaysFrom(dateStr);
  if (diff < 0) return pastLabel;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return "This Week";
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
  none: { label: "None", mark: "", color: "#9CA3AF" },
  low: { label: "Low", mark: "!", color: "#3E6B52" },
  medium: { label: "Medium", mark: "!!", color: "#A8791A" },
  high: { label: "High", mark: "!!!", color: "#B5462A" },
};
export const PRIORITY_ORDER = ["none", "low", "medium", "high"];
