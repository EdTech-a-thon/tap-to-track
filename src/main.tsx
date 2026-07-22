import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { Auth } from "./components/Auth";
import { Today } from "./components/Today";
import { dataStore, type SyncStatus } from "./data";
import { useApp } from "./state";
import "./styles.css";

const Manage = lazy(() => import("./components/Manage").then((module) => ({ default: module.Manage })));
const Progress = lazy(() => import("./components/Progress").then((module) => ({ default: module.Progress })));
const ClassCalendar = lazy(() => import("./components/ClassCalendar").then((module) => ({ default: module.ClassCalendar })));
const StudentApp = lazy(() => import("./components/StudentApp").then((module) => ({ default: module.StudentApp })));

let installUpdate: ((reloadPage?: boolean) => Promise<void>) | undefined;
if ("serviceWorker" in navigator) installUpdate = registerSW({
  immediate: true,
  onNeedRefresh: () => window.dispatchEvent(new Event("tap-app-update")),
});

function TeacherApp() {
  const app = useApp();
  const [signedIn, setSignedIn] = useState<boolean>();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(dataStore.getSyncStatus());
  const [syncOpen, setSyncOpen] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const syncPanel = useRef<HTMLDivElement>(null);
  const load = async () => {
    const response = await fetch("/api/auth/me", { credentials: "include" });
    if (!response.ok) {
      setSignedIn(false);
      app.setLoading(false);
      return;
    }
    setSignedIn(true);
    const classes = await dataStore.getClasses();
    app.setClasses(classes);
    const classId = classes.some((item) => item.id === app.classId)
      ? app.classId
      : (classes[0]?.id ?? "");
    if (classId !== app.classId) app.setClassId(classId);
    if (classId) app.setSnapshot(await dataStore.getSnapshot(classId, true));
    app.setLoading(false);
  };
  useEffect(() => {
    void load().catch((error) => {
      app.setError(error.message);
      app.setLoading(false);
    });
  }, []);
  useEffect(() => dataStore.subscribeSyncStatus(setSyncStatus), []);
  useEffect(() => {
    if (syncOpen) syncPanel.current?.focus();
  }, [syncOpen]);
  useEffect(() => {
    const online = () => void dataStore.sync();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dataStore.hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const update = () => setUpdateReady(true);
    addEventListener("online", online);
    addEventListener("beforeunload", beforeUnload);
    addEventListener("tap-app-update", update);
    return () => {
      removeEventListener("online", online);
      removeEventListener("beforeunload", beforeUnload);
      removeEventListener("tap-app-update", update);
    };
  }, []);
  useEffect(() => {
    if (!signedIn || !app.classId) return;
    void dataStore
      .getSnapshot(app.classId, true)
      .then(app.setSnapshot)
      .catch((error) => app.setError(error.message));
    return dataStore.subscribe(app.classId, app.setSnapshot);
  }, [signedIn, app.classId]);
  if (app.loading || signedIn === undefined)
    return (
      <main className="loading-screen">
        <div className="brand-mark">T</div>
        <p>Preparing your classroom...</p>
      </main>
    );
  if (!signedIn)
    return (
      <Auth
        onSuccess={() => {
          app.setLoading(true);
          void load();
        }}
      />
    );
  const createClass = async () => {
    const name = prompt("Class name");
    if (!name?.trim()) return;
    const room = await dataStore.createClass(name.trim());
    app.setClasses([...app.classes, room]);
    app.setClassId(room.id);
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div>
            <strong>Tap-to-Track</strong>
            <button className={`sync-status sync-${syncStatus.state}`} onClick={() => setSyncOpen((open) => !open)} aria-expanded={syncOpen} aria-controls="sync-panel">
              {syncLabel(syncStatus)}
            </button>
          </div>
        </div>
        <div className="class-switch">
          <label htmlFor="class">Class</label>
          <select
            id="class"
            value={app.classId}
            onChange={(event) => app.setClassId(event.target.value)}
          >
            <option value="">Choose a class</option>
            {app.classes.map((room) => (
              <option value={room.id} key={room.id}>
                {room.name}
              </option>
            ))}
          </select>
          <button
            className="icon-button"
            onClick={createClass}
            aria-label="Create class"
          >
            +
          </button>
        </div>
        <button
          className="text-button calendar-button"
          onClick={() => setCalendarOpen(true)}
        >
          Class calendar
        </button>
        <button
          className="text-button signout"
          onClick={async () => {
            if (dataStore.hasUnsavedChanges() && !confirm("Some changes have not been saved. Sign out anyway?")) return;
            await dataStore.signOut();
            location.reload();
          }}
        >
          Sign out
        </button>
      </header>
      {syncOpen && (
        <div className="sync-panel" id="sync-panel" ref={syncPanel} tabIndex={-1} role="region" aria-label="Sync details">
          <div className="sync-panel-heading"><strong>Saving and sync</strong><button className="icon-button" onClick={() => setSyncOpen(false)} aria-label="Close sync details">×</button></div>
          <p>{syncStatus.failed.length ? "These changes need your attention." : syncLabel(syncStatus)}</p>
          {syncStatus.failed.map((change) => (
            <div className="sync-failure" key={change.id}>
              <strong>{change.method} {change.path}</strong>
              <span>{change.status ? `${change.status}: ` : ""}{change.error ?? "Could not save this change."}</span>
              <div><button onClick={() => void dataStore.retryChange(change.id)}>Retry</button><button className="text-button" onClick={() => void dataStore.discardChange(change.id)}>Discard</button></div>
            </div>
          ))}
        </div>
      )}
      {updateReady && <div className="update-prompt" role="status"><span>A safe app update is ready.</span><button onClick={() => { if (!dataStore.hasUnsavedChanges()) void installUpdate?.(true); else setSyncOpen(true); }}>Reload to update</button><button className="text-button" onClick={() => setUpdateReady(false)}>Later</button></div>}
      <nav className="main-nav" aria-label="Main sections">
        {(["today", "classes", "insights"] as const).map((view) => (
          <button
            key={view}
            className={app.view === view ? "active" : ""}
            aria-current={app.view === view ? "page" : undefined}
            onClick={() => app.setView(view)}
          >
            {view[0].toUpperCase() + view.slice(1)}
          </button>
        ))}
      </nav>
      <main className="page">
        {app.error && <div className="error" role="alert">{app.error}</div>}
        {!app.classId ? (
          <section className="empty card">
            <span>✦</span>
            <h1>Create your first class</h1>
            <p>Each class keeps its own roster, skills, and history.</p>
            <button className="primary" onClick={createClass}>
              Create a class
            </button>
          </section>
        ) : app.view === "today" ? (
          <Today />
        ) : app.view === "classes" ? (
          <Suspense fallback={<ViewLoading />}><Manage /></Suspense>
        ) : (
          <Suspense fallback={<ViewLoading />}><Progress /></Suspense>
        )}
      </main>
      {calendarOpen && <Suspense fallback={<ViewLoading />}><ClassCalendar onClose={() => setCalendarOpen(false)} /></Suspense>}
    </div>
  );
}

function syncLabel(status: SyncStatus) {
  if (status.state === "needs-attention") return `! ${status.failed.length} need attention`;
  if (status.state === "offline") return "⌁ Saved on this device";
  if (status.state === "saving") return `↻ Saving ${status.pendingCount || 1}`;
  return "✓ Saved";
}

const join = location.pathname.match(/^\/join\/([^/]+)/);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {join ? <Suspense fallback={<ViewLoading />}><StudentApp code={decodeURIComponent(join[1])} /></Suspense> : <TeacherApp />}
  </React.StrictMode>,
);

function ViewLoading() { return <div className="view-loading">Opening...</div>; }
