const KEY = "dashboard-theme-v1";
const THEME_COLORS = { light: "#f7f6f3", dark: "#14161a" };

export const THEMES = ["system", "light", "dark"];

export function readTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    return THEMES.includes(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

function resolved(theme) {
  if (theme !== "system") return theme;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Applies the theme and keeps <meta name="theme-color"> in step, which is what
 *  colours the iOS status bar and the Android address bar once the app is
 *  installed to the home screen. */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);

  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute("content", THEME_COLORS[resolved(theme)]);

  try { localStorage.setItem(KEY, theme); } catch {}
}
