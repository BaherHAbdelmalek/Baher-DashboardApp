import { useEffect, useMemo, useState } from "react";
import {
  LayoutGrid, AlignJustify, CheckSquare, Calendar, Bell,
  LogOut, BellRing, BellOff, Copy, Check as CheckIcon,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { styles, DEFAULT_PROJECTS } from "./styles";
import { useTable } from "./lib/useTable";
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

  if (session === undefined) return <div style={styles.loading}>Loading…</div>;
  if (!session) return <Auth />;
  return <Dashboard session={session} />;
}

function Dashboard({ session }) {
  const userId = session.user.id;
  const tasksHook = useTable("tasks", userId);
  const meetingsHook = useTable("meetings", userId);
  const remindersHook = useTable("reminders", userId);

  const [viewMode, setViewMode] = useState("tabs");
  const [activeTab, setActiveTab] = useState("tasks");
  const [sectionVisibility, setSectionVisibility] = useState({ tasks: true, meetings: true, reminders: true });
  const [filterProject, setFilterProject] = useState("all");
  const [showDone, setShowDone] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [icsToken, setIcsToken] = useState(null);
  const [copied, setCopied] = useState(false);
  const [pushStatus, setPushStatus] = useState("checking");
  const [pushError, setPushError] = useState(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(VIEW_KEY) || "{}");
      if (saved.viewMode) setViewMode(saved.viewMode);
      if (saved.sectionVisibility) setSectionVisibility(saved.sectionVisibility);
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ viewMode, sectionVisibility }));
  }, [viewMode, sectionVisibility]);

  useEffect(() => {
    supabase
      .from("user_settings")
      .select("ics_token")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => data && setIcsToken(data.ics_token));
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
    return Array.from(set);
  }, [tasksHook.items, meetingsHook.items, remindersHook.items]);

  if (!allLoaded) return <div style={styles.loading}>Loading your dashboard…</div>;

  const errors = [tasksHook.error, meetingsHook.error, remindersHook.error].filter(Boolean);

  const openCounts = {
    tasks: tasksHook.items.filter((t) => t.status !== "done" && (filterProject === "all" || t.project === filterProject)).length,
    meetings: meetingsHook.items.filter((m) => m.status !== "done" && (filterProject === "all" || m.project === filterProject)).length,
    reminders: remindersHook.items.filter((r) => r.status !== "done" && (filterProject === "all" || r.project === filterProject)).length,
  };

  const TABS = [
    { id: "tasks", label: "Tasks", icon: CheckSquare, count: openCounts.tasks },
    { id: "meetings", label: "Meetings", icon: Calendar, count: openCounts.meetings },
    { id: "reminders", label: "Reminders", icon: Bell, count: openCounts.reminders },
  ];

  const icsUrl = icsToken ? `${window.location.origin}/api/ics/${icsToken}` : null;

  function copyIcsUrl() {
    if (!icsUrl) return;
    navigator.clipboard.writeText(icsUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div style={styles.page}>
      <style>{`
        .bh-input:focus, .bh-select:focus { outline: 2px solid #2C5F8A; outline-offset: 1px; }
        .bh-btn:hover { background: #234b6e; }
        .bh-task:hover .bh-del { opacity: 1; }
        .bh-del { opacity: 0; transition: opacity 0.15s; }
        .bh-chip:hover { border-color: #2C5F8A; }
        .bh-board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .bh-tab:hover { color: #2C5F8A; }
        @media (max-width: 640px) { .bh-board { grid-template-columns: 1fr; } }
      `}</style>



      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>Baher — Dashboard</div>
          <div style={styles.count}>
            {openCounts.tasks} tasks · {openCounts.meetings} meetings · {openCounts.reminders} reminders
          </div>
        </div>
        <div style={styles.headerActions}>
          <button className="bh-chip" style={styles.iconBtn} onClick={() => setShowSettings((s) => !s)}>
            Settings
          </button>
          <button
            className="bh-chip"
            style={{ ...styles.viewBtn, ...(viewMode === "tabs" ? styles.viewBtnActive : {}) }}
            onClick={() => setViewMode("tabs")}
          >
            <LayoutGrid size={13} /> Tabs
          </button>
          <button
            className="bh-chip"
            style={{ ...styles.viewBtn, ...(viewMode === "stacked" ? styles.viewBtnActive : {}) }}
            onClick={() => setViewMode("stacked")}
          >
            <AlignJustify size={13} /> Stacked
          </button>
          <button className="bh-chip" style={styles.iconBtn} onClick={() => supabase.auth.signOut()}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </header>

      {showSettings && (
        <div style={styles.settingsPanel}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Apple Calendar</div>
          <div>Subscribe to this feed from Calendar → Add Account → Other → Add Subscribed Calendar. It refreshes on Apple's own schedule (not instant).</div>
          <div style={styles.settingsRow}>
            <div style={styles.urlBox}>{icsUrl || "Loading…"}</div>
            <button className="bh-chip" style={styles.iconBtn} onClick={copyIcsUrl} disabled={!icsUrl}>
              {copied ? <CheckIcon size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div style={{ fontWeight: 600, marginTop: 16, marginBottom: 6 }}>Notifications</div>
          {pushStatus === "unsupported" && (
            <div>
              This browser/device doesn't support push notifications here.
              {!isStandalone() && " On iPhone, add this app to your Home Screen first (Share → Add to Home Screen), then open it from there."}
            </div>
          )}
          {pushStatus !== "unsupported" && (
            <div style={styles.settingsRow}>
              <button className="bh-chip" style={styles.iconBtn} onClick={togglePush}>
                {pushStatus === "subscribed" ? <><BellOff size={13} /> Turn off</> : <><BellRing size={13} /> Turn on</>}
              </button>
              <span style={{ color: "#6B7280" }}>
                {pushStatus === "subscribed" ? "Notifications are on for this device." : "Notifications are off for this device."}
              </span>
            </div>
          )}
          {pushError && <div style={styles.authError}>{pushError}</div>}
        </div>
      )}

      <div style={styles.filterRow}>
        <button className="bh-chip" style={{ ...styles.chip, ...(filterProject === "all" ? styles.chipActive : {}) }} onClick={() => setFilterProject("all")}>
          All projects
        </button>
        {projects.map((p) => (
          <button key={p} className="bh-chip" style={{ ...styles.chip, ...(filterProject === p ? styles.chipActive : {}) }} onClick={() => setFilterProject(p)}>
            {p}
          </button>
        ))}
        <label style={styles.doneToggle}>
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          show done
        </label>
      </div>

      {viewMode === "stacked" && (
        <div style={styles.filterRow}>
          <span style={styles.visLabel}>Show:</span>
          {TABS.map((t) => (
            <label key={t.id} style={styles.visChip}>
              <input
                type="checkbox"
                checked={sectionVisibility[t.id]}
                onChange={(e) => setSectionVisibility({ ...sectionVisibility, [t.id]: e.target.checked })}
              />
              {t.label}
            </label>
          ))}
        </div>
      )}

      {errors.length > 0 && <div style={styles.errorBanner}>{errors[0]}</div>}

      {viewMode === "tabs" && (
        <div style={styles.tabBar}>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                className="bh-tab"
                style={{ ...styles.tabBtn, ...(activeTab === t.id ? styles.tabBtnActive : {}) }}
                onClick={() => setActiveTab(t.id)}
              >
                <Icon size={14} /> {t.label} <span style={styles.tabCount}>{t.count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={styles.sectionsWrap}>
        {viewMode === "tabs" ? (
          <>
            {activeTab === "tasks" && <ListSection icon={CheckSquare} title="Tasks & To-Dos" pastLabel="Past" {...tasksHook} projects={projects} filterProject={filterProject} showDone={showDone} />}
            {activeTab === "meetings" && <MeetingsSection {...meetingsHook} projects={projects} filterProject={filterProject} showDone={showDone} />}
            {activeTab === "reminders" && <ListSection icon={Bell} title="Reminders" pastLabel="Overdue" {...remindersHook} projects={projects} filterProject={filterProject} showDone={showDone} />}
          </>
        ) : (
          <>
            {sectionVisibility.tasks && <ListSection icon={CheckSquare} title="Tasks & To-Dos" pastLabel="Past" {...tasksHook} projects={projects} filterProject={filterProject} showDone={showDone} />}
            {sectionVisibility.meetings && <MeetingsSection {...meetingsHook} projects={projects} filterProject={filterProject} showDone={showDone} />}
            {sectionVisibility.reminders && <ListSection icon={Bell} title="Reminders" pastLabel="Overdue" {...remindersHook} projects={projects} filterProject={filterProject} showDone={showDone} />}
          </>
        )}
      </div>
    </div>
  );
}
