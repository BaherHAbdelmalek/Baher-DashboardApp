import { useEffect, useMemo, useState } from "react";
import {
  LayoutGrid, AlignJustify, CheckSquare, Calendar, Bell,
  LogOut, BellRing, BellOff, Copy, Check as CheckIcon,
  Settings as SettingsIcon, X, Sun, Moon, Monitor,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { DEFAULT_PROJECTS } from "./styles";
import { useTable } from "./lib/useTable";
import { useMediaQuery } from "./lib/useMediaQuery";
import { readTheme, applyTheme } from "./lib/theme";
import { subscribeToPush, unsubscribeFromPush, getPushStatus, pushSupported, isStandalone } from "./lib/push";
import Auth from "./components/Auth";
import ListSection from "./components/ListSection";
import MeetingsSection from "./components/MeetingsSection";

const VIEW_KEY = "dashboard-view-v1"; // per-device UI preference, kept in localStorage on purpose

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Theme is applied at the app root so it also covers the sign-in screen.
  useEffect(() => { applyTheme(readTheme()); }, []);

  if (session === undefined) return <BootSkeleton />;
  if (!session) return <Auth />;
  return <Dashboard session={session} />;
}

function BootSkeleton({ label = "Loading…" }) {
  return (
    <div className="app">
      <div className="app__inner" style={{ paddingTop: 28 }}>
        <span className="sr-only" role="status">{label}</span>
        <div className="skeleton" aria-hidden="true">
          <div className="skeleton__bar" style={{ height: 30, width: "44%" }} />
          <div className="skeleton__bar" style={{ height: 40, marginTop: 14 }} />
          <div className="skeleton__bar" />
          <div className="skeleton__bar" />
          <div className="skeleton__bar" style={{ opacity: 0.6 }} />
        </div>
      </div>
    </div>
  );
}

const TAB_META = {
  tasks: { label: "Tasks", icon: CheckSquare },
  meetings: { label: "Meetings", icon: Calendar },
  reminders: { label: "Reminders", icon: Bell },
};

function Dashboard({ session }) {
  const userId = session.user.id;
  const tasksHook = useTable("tasks", userId);
  const meetingsHook = useTable("meetings", userId);
  const remindersHook = useTable("reminders", userId);

  const isPhone = useMediaQuery("(max-width: 719px)");

  const [viewMode, setViewMode] = useState("tabs");
  const [activeTab, setActiveTab] = useState("tasks");
  const [sectionVisibility, setSectionVisibility] = useState({ tasks: true, meetings: true, reminders: true });
  const [excludedProjects, setExcludedProjects] = useState(() => new Set());
  const [showDone, setShowDone] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState(readTheme);
  const [icsToken, setIcsToken] = useState(null);
  const [copied, setCopied] = useState(false);
  const [pushStatus, setPushStatus] = useState("checking");
  const [pushError, setPushError] = useState(null);
  const [dismissedError, setDismissedError] = useState(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(VIEW_KEY) || "{}");
      if (saved.viewMode) setViewMode(saved.viewMode);
      if (saved.sectionVisibility) setSectionVisibility(saved.sectionVisibility);
      if (saved.activeTab && TAB_META[saved.activeTab]) setActiveTab(saved.activeTab);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({ viewMode, sectionVisibility, activeTab }));
    } catch {}
  }, [viewMode, sectionVisibility, activeTab]);

  function pickTheme(t) { setTheme(t); applyTheme(t); }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("ics_token, timezone")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled || !data) return;
      setIcsToken(data.ics_token);

      // The notification job runs on a UTC server but has to reason about the
      // user's wall clock ("30 minutes before your 9am"), and only the browser
      // knows which zone that is. Recorded on each sign-in so it follows you
      // when you travel.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && tz !== data.timezone) {
        await supabase.from("user_settings").update({ timezone: tz }).eq("user_id", userId);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!pushSupported()) { setPushStatus("unsupported"); return; }
    getPushStatus().then(setPushStatus);
  }, []);

  async function togglePush() {
    setPushError(null);
    try {
      if (pushStatus === "subscribed") {
        await unsubscribeFromPush();
        setPushStatus("not-subscribed");
      } else {
        await subscribeToPush(userId);
        setPushStatus("subscribed");
      }
    } catch (err) {
      setPushError(err.message);
    }
  }

  const allLoaded = !tasksHook.loading && !meetingsHook.loading && !remindersHook.loading;

  const projects = useMemo(() => {
    const set = new Set(DEFAULT_PROJECTS);
    tasksHook.items.forEach((t) => set.add(t.project));
    meetingsHook.items.forEach((t) => set.add(t.project));
    remindersHook.items.forEach((t) => set.add(t.project));
    return Array.from(set).filter(Boolean);
  }, [tasksHook.items, meetingsHook.items, remindersHook.items]);

  // A phone has no room for a top tab strip, so navigation there comes from the
  // bottom bar — which means the stacked layout only applies from tablet up.
  const effectiveView = isPhone ? "tabs" : viewMode;

  const openCounts = {
    tasks: tasksHook.items.filter((t) => t.status !== "done" && !excludedProjects.has(t.project)).length,
    meetings: meetingsHook.items.filter((m) => m.status !== "done" && !excludedProjects.has(m.project)).length,
    reminders: remindersHook.items.filter((r) => r.status !== "done" && !excludedProjects.has(r.project)).length,
  };

  const errors = [tasksHook.error, meetingsHook.error, remindersHook.error].filter(Boolean);
  const activeError = errors.find((e) => e !== dismissedError) || null;

  const icsUrl = icsToken ? `${window.location.origin}/api/ics/${icsToken}` : null;

  function copyIcsUrl() {
    if (!icsUrl) return;
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1600); };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(icsUrl).then(done, () => window.prompt("Copy this URL:", icsUrl));
    } else {
      // Safari refuses clipboard writes outside a secure context; show the URL.
      window.prompt("Copy this URL:", icsUrl);
    }
  }

  function openSettings() {
    setShowSettings(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const sections = {
    tasks: (
      <ListSection
        key="tasks"
        icon={CheckSquare}
        title="Tasks & To-Dos"
        pastLabel="Past"
        {...tasksHook}
        projects={projects}
        excludedProjects={excludedProjects}
        showDone={showDone}
      />
    ),
    meetings: (
      <MeetingsSection
        key="meetings"
        {...meetingsHook}
        projects={projects}
        excludedProjects={excludedProjects}
        showDone={showDone}
      />
    ),
    reminders: (
      <ListSection
        key="reminders"
        icon={Bell}
        title="Reminders"
        pastLabel="Overdue"
        {...remindersHook}
        projects={projects}
        excludedProjects={excludedProjects}
        showDone={showDone}
      />
    ),
  };

  const tabIds = ["tasks", "meetings", "reminders"];

  return (
    <div className="app">
      <header className="header">
        <div className="header__inner">
          <div style={{ minWidth: 0 }}>
            <div className="header__title">Baher — Dashboard</div>
            <div className="header__sub">
              {openCounts.tasks} tasks · {openCounts.meetings} meetings · {openCounts.reminders} reminders
            </div>
          </div>
          <div className="header__actions">
            <ThemeToggle theme={theme} onPick={pickTheme} />
            {!isPhone && (
              <>
                <button
                  type="button"
                  className={`btn${viewMode === "tabs" ? " btn--on" : ""}`}
                  onClick={() => setViewMode("tabs")}
                  aria-pressed={viewMode === "tabs"}
                >
                  <LayoutGrid size={14} aria-hidden="true" /> Tabs
                </button>
                <button
                  type="button"
                  className={`btn${viewMode === "stacked" ? " btn--on" : ""}`}
                  onClick={() => setViewMode("stacked")}
                  aria-pressed={viewMode === "stacked"}
                >
                  <AlignJustify size={14} aria-hidden="true" /> Stacked
                </button>
                <button
                  type="button"
                  className={`btn${showSettings ? " btn--on" : ""}`}
                  onClick={() => setShowSettings((s) => !s)}
                  aria-expanded={showSettings}
                >
                  <SettingsIcon size={14} aria-hidden="true" /> Settings
                </button>
              </>
            )}
            <button
              type="button"
              className="btn btn--square"
              onClick={() => { if (window.confirm("Sign out of this device?")) supabase.auth.signOut(); }}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <div className="app__inner">
        {showSettings && (
          <SettingsPanel
            onClose={() => setShowSettings(false)}
            icsUrl={icsUrl}
            copied={copied}
            onCopy={copyIcsUrl}
            pushStatus={pushStatus}
            pushError={pushError}
            onTogglePush={togglePush}
          />
        )}

        {activeError && (
          <div className="banner banner--error" role="alert">
            <span>{activeError}</span>
            <button
              type="button"
              className="iconbtn banner__close"
              onClick={() => {
                setDismissedError(activeError);
                tasksHook.clearError(); meetingsHook.clearError(); remindersHook.clearError();
              }}
              aria-label="Dismiss error"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        )}

        {!allLoaded ? (
          <BootSkeleton label="Loading your dashboard…" />
        ) : (
          <>
            <div className="chiprow chiprow--scroll" aria-label="Filter by category">
              <button
                type="button"
                className={`chip${excludedProjects.size === 0 ? " chip--on" : ""}`}
                onClick={() => setExcludedProjects(new Set())}
              >
                All categories
              </button>
              {projects.map((p) => {
                const active = !excludedProjects.has(p);
                return (
                  <button
                    key={p}
                    type="button"
                    className={`chip${active ? " chip--on" : ""}`}
                    aria-pressed={active}
                    onClick={() => {
                      const next = new Set(excludedProjects);
                      if (active) next.add(p); else next.delete(p);
                      setExcludedProjects(next);
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            <div className="chiprow">
              <label className="togglelabel togglelabel--boxed">
                <input
                  className="check-input"
                  type="checkbox"
                  checked={showDone}
                  onChange={(e) => setShowDone(e.target.checked)}
                />
                Show completed
              </label>

              {effectiveView === "stacked" &&
                tabIds.map((id) => (
                  <label key={id} className="togglelabel togglelabel--boxed">
                    <input
                      className="check-input"
                      type="checkbox"
                      checked={sectionVisibility[id]}
                      onChange={(e) => setSectionVisibility({ ...sectionVisibility, [id]: e.target.checked })}
                    />
                    {TAB_META[id].label}
                  </label>
                ))}
            </div>

            {effectiveView === "tabs" && (
              <div className="tabbar" role="tablist" aria-label="Sections">
                {tabIds.map((id) => {
                  const Icon = TAB_META[id].icon;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === id}
                      className={`tab${activeTab === id ? " tab--on" : ""}`}
                      onClick={() => setActiveTab(id)}
                    >
                      <Icon size={15} aria-hidden="true" /> {TAB_META[id].label}
                      <span className="tab__count">{openCounts[id]}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className={`sections${effectiveView === "stacked" ? " sections--stacked" : ""}`}>
              {effectiveView === "tabs"
                ? sections[activeTab]
                : tabIds.filter((id) => sectionVisibility[id]).map((id) => sections[id])}
            </div>
          </>
        )}
      </div>

      {/* Phone-only bottom navigation — within thumb reach, unlike a tab strip
          pinned to the top of a 6.5" screen. */}
      <nav className="bottomnav" aria-label="Sections">
        {tabIds.map((id) => {
          const Icon = TAB_META[id].icon;
          const on = activeTab === id && !showSettings;
          return (
            <button
              key={id}
              type="button"
              className={`bottomnav__btn${on ? " bottomnav__btn--on" : ""}`}
              aria-current={on ? "page" : undefined}
              onClick={() => { setActiveTab(id); setShowSettings(false); }}
            >
              <Icon size={20} aria-hidden="true" />
              {TAB_META[id].label}
              {openCounts[id] > 0 && (
                <span className="bottomnav__badge">{openCounts[id] > 99 ? "99+" : openCounts[id]}</span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          className={`bottomnav__btn${showSettings ? " bottomnav__btn--on" : ""}`}
          onClick={() => (showSettings ? setShowSettings(false) : openSettings())}
          aria-expanded={showSettings}
        >
          <SettingsIcon size={20} aria-hidden="true" />
          Settings
        </button>
      </nav>
    </div>
  );
}

function ThemeToggle({ theme, onPick }) {
  const ICONS = { system: Monitor, light: Sun, dark: Moon };
  const NEXT = { system: "light", light: "dark", dark: "system" };
  const Icon = ICONS[theme];
  return (
    <button
      type="button"
      className="btn btn--square"
      onClick={() => onPick(NEXT[theme])}
      aria-label={`Theme: ${theme}. Switch to ${NEXT[theme]}.`}
      title={`Theme: ${theme}`}
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}

function SettingsPanel({ onClose, icsUrl, copied, onCopy, pushStatus, pushError, onTogglePush }) {
  return (
    <div className="panel settings" style={{ marginTop: 16, marginBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <h2 style={{ fontSize: 16, fontWeight: 650, margin: 0 }}>Settings</h2>
        <button type="button" className="iconbtn" style={{ marginLeft: "auto" }} onClick={onClose} aria-label="Close settings">
          <X size={17} aria-hidden="true" />
        </button>
      </div>

      <div>
        <div className="settings__group-title">Apple Calendar</div>
        <div className="settings__hint">
          Subscribe to this feed from Calendar → Add Account → Other → Add Subscribed Calendar.
          It refreshes on Apple's own schedule, not instantly. Repeating meetings are included
          as their next occurrences.
        </div>
        <div className="settings__row">
          <div className="urlbox">{icsUrl || "Loading…"}</div>
          <button type="button" className="btn" onClick={onCopy} disabled={!icsUrl}>
            {copied ? <CheckIcon size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div>
        <div className="settings__group-title">Notifications</div>
        {pushStatus === "unsupported" ? (
          <div className="settings__hint">
            This browser or device doesn't support push notifications here.
            {!isStandalone() && " On iPhone and iPad, add this app to your Home Screen first (Share → Add to Home Screen), then open it from there."}
          </div>
        ) : (
          <>
            <div className="settings__hint">
              A heads-up ~30 minutes before a meeting, and a daily nudge for due or overdue reminders.
            </div>
            <div className="settings__row">
              <button type="button" className="btn" onClick={onTogglePush} disabled={pushStatus === "checking"}>
                {pushStatus === "subscribed"
                  ? <><BellOff size={14} aria-hidden="true" /> Turn off</>
                  : <><BellRing size={14} aria-hidden="true" /> Turn on</>}
              </button>
              <span className="settings__hint">
                {pushStatus === "checking"
                  ? "Checking…"
                  : pushStatus === "subscribed"
                    ? "On for this device."
                    : "Off for this device."}
              </span>
            </div>
          </>
        )}
        {pushError && <div className="banner banner--error" style={{ marginTop: 10, marginBottom: 0 }} role="alert">{pushError}</div>}
      </div>
    </div>
  );
}
