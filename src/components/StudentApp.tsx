import { useEffect, useState } from "react";
import { dataStore } from "../data";
import type { ClassTimer } from "../types";

type JoinView = {
  classRoom: { id: string; name: string };
  students: {
    id: string;
    displayName: string;
  }[];
};
type OwnView = {
  student: JoinView["students"][number];
  classRoom: {
    id: string;
    name: string;
  };
  requestTypes: {
    id: string;
    label: string;
    color: string;
    behavior: "attention" | "presence" | "completion" | "custom";
    resolveLabel: string;
  }[];
  requests: {
    id: string;
    requestTypeId: string;
    status: "active" | "acknowledged" | "resolved" | "cancelled";
    behavior: "attention" | "presence" | "completion" | "custom";
    joinedAt: string;
    acknowledgedAt: string | null;
    resolvedAt: string | null;
    cancelledAt: string | null;
    updatedAt: string;
  }[];
  requestPositions: {
    requestId: string;
    requestTypeId: string;
    position: number;
  }[];
  participation: { participatedDays: number; eligibleDays: number };
  timer: ClassTimer | null;
};

type StudentSocketMessage =
  | { type: "connected" }
  | { type: "timer-state"; classId: string; timer: ClassTimer }
  | {
      type: "student-refresh";
      classId: string;
      reason: "attendance" | "mastery" | "class-day" | "settings" | "request-types" | "student-profile";
    }
  | {
      type: "request-updated";
      classId: string;
      requestId: string;
      studentId: string;
    };

export function StudentApp({ code }: { code: string }) {
  const [join, setJoin] = useState<JoinView>();
  const [view, setView] = useState<OwnView>();
  const [tab, setTab] = useState<"participation" | "requests">("participation");
  const [error, setError] = useState("");
  const [timer, setTimer] = useState<ClassTimer | null>(null);
  const [clock, setClock] = useState(Date.now());
  const completedRevision = useState(() => new Set<number>())[0];
  const refresh = () =>
    dataStore.getStudentView().then((value) => { const next = value as OwnView; setView(next); setTimer(next.timer); });

  useEffect(() => {
    dataStore
      .joinClass(code)
      .then((value) => setJoin(value as JoinView))
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Class not found."),
      );
    void refresh().catch(() => undefined);
  }, [code]);
  useEffect(() => {
    if (!view) return;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    let socket: WebSocket | undefined;
    let retry: number | undefined;
    let attempts = 0;
    let stopped = false;
    const connect = () => {
      socket = new WebSocket(`${protocol}//${location.host}/ws`);
      socket.onopen = () => { attempts = 0; void refresh(); };
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data) as StudentSocketMessage;
        if (message.type === "connected") return;
        if (message.type === "timer-state" && message.classId === view.classRoom.id) {
          setTimer(message.timer);
          return;
        }
        if (message.type === "student-refresh" && message.classId === view.classRoom.id) void refresh();
        if (message.type === "request-updated" && message.studentId === view.student.id) void refresh();
      };
      socket.onclose = () => {
        if (!stopped) retry = window.setTimeout(connect, Math.min(30_000, 500 * 2 ** attempts++));
      };
    };
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retry);
      socket?.close();
    };
  }, [view?.student.id]);
  useEffect(() => {
    if (timer?.status !== "running") return;
    const interval = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [timer?.revision, timer?.status]);
  const timerSeconds = timer?.status === "running" && timer.endsAt ? Math.max(0, Math.ceil((Date.parse(timer.endsAt) - clock) / 1000)) : timer?.remainingSeconds ?? 0;
  useEffect(() => {
    if (!timer || timer.status !== "finished" && timerSeconds > 0 || completedRevision.has(timer.revision)) return;
    completedRevision.add(timer.revision); document.body.classList.add("flash"); window.setTimeout(() => document.body.classList.remove("flash"), 800); beep();
  }, [completedRevision, timer?.revision, timer?.status, timerSeconds]);

  if (error)
    return (
      <main className="student-shell">
        <section className="empty card">
          <h1>Class unavailable</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  if (!join)
    return (
      <main className="student-shell">
        <p className="loading">Opening your classroom...</p>
      </main>
    );
  if (!view)
    return (
      <main className="student-shell">
        <header className="student-header">
          <div>
            <p className="eyebrow">JOIN {code.toUpperCase()}</p>
            <h1>{join.classRoom.name}</h1>
          </div>
        </header>
        <section className="self-select">
          <h2>Who are you?</h2>
          <p>
            Tap your teacher-chosen display name. You never need to type
            personal information.
          </p>
          <div className="student-grid">
            {join.students.map((student) => (
              <button
                className="student-tile"
                key={student.id}
                onClick={async () => {
                  await dataStore.selectStudent(code, student.id);
                  await refresh();
                }}
              >
                <strong>{student.displayName}</strong>
              </button>
            ))}
          </div>
        </section>
      </main>
    );

  const request = view.requests.find(
    (item) => item.status === "active" || item.status === "acknowledged",
  );
  const resolvedRequest = !request
    ? view.requests.find((item) => item.status === "resolved")
    : undefined;
  const position = request
    ? (view.requestPositions.find((item) => item.requestId === request.id)
        ?.position ?? 1)
    : 0;
  document.title =
    request?.behavior === "attention" && request.status === "active"
      ? `${view.student.displayName} · #${position} waiting`
      : view.student.displayName;
  const toggleRequest = async (id: string) => {
    await dataStore.studentAction(
      `/requests/${id}`,
      request?.requestTypeId === id ? "DELETE" : "POST",
    );
    await refresh();
  };

  return (
    <main className="student-shell">
      <header className="student-header">
        <div className="student-heading-copy">
          <p className="eyebrow">{view.classRoom.name}</p>
          <h1>{view.student.displayName}</h1>
        </div>
        <button
          className="text-button"
          onClick={async () => {
            await dataStore.studentAction("/logout", "POST");
            setView(undefined);
          }}
        >
          Not you?
        </button>
      </header>
       <section className="student-content">
        {timer && timer.status !== "stopped" && <section className={`card student-timer ${timer.status}`} aria-live="polite"><p className="eyebrow">CLASS TIMER</p><strong>{formatTime(timerSeconds)}</strong><h2>{timer.label}</h2><p>{timer.status === "paused" ? "Paused" : timer.status === "finished" || timerSeconds === 0 ? "Time is up" : "Keep going"}</p></section>}
        {tab === "participation" && <div className="student-participation"><p className="eyebrow">MY PARTICIPATION</p><div className="card participation-total"><strong>{view.participation.participatedDays}/{view.participation.eligibleDays}</strong><h2>class days participated</h2><p>This counts class days when you were present, participation was expected, and your teacher recorded a Positive Action.</p></div></div>}
        {tab === "requests" && (
          <div>
            <p className="eyebrow">QUIET REQUESTS</p>
            <h2>What do you need?</h2>
            <div
              className={`request-status-card ${request?.status ?? (resolvedRequest ? "resolved" : "idle")}`}
              aria-live="polite"
            >
              <strong>
                {request?.status === "acknowledged"
                  ? "Your teacher saw your request"
                  : request?.behavior === "attention"
                    ? `You're #${position} in line`
                    : request
                      ? "Your request was sent"
                      : resolvedRequest
                        ? "Your request was completed"
                        : "No active request"}
              </strong>
              <span>
                {request?.status === "acknowledged"
                  ? "They are following up. You can cancel if you no longer need it."
                  : request?.behavior === "attention"
                    ? "This position is only for requests that need teacher attention."
                    : request
                      ? "Your request stays here until your teacher responds or you cancel it."
                      : resolvedRequest
                        ? "Confirmed complete. You can make another request whenever you need one."
                        : "Only you and your teacher can see your request."}
              </span>
            </div>
            <div className="request-choices">
              {view.requestTypes.map((type) => (
                <button
                  key={type.id}
                  disabled={!!request && request.requestTypeId !== type.id}
                  onClick={() => toggleRequest(type.id)}
                  style={{ borderColor: type.color }}
                >
                  <span style={{ background: type.color }} />
                  {type.label}
                  <small>
                    {request?.requestTypeId === type.id
                      ? request.status === "acknowledged"
                        ? "Acknowledged · cancel request"
                        : "Cancel request"
                      : ""}
                  </small>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
      <nav className="student-tabs" aria-label="Student sections">
        <button
          className={tab === "participation" ? "active" : ""}
          aria-current={tab === "participation" ? "page" : undefined}
          onClick={() => setTab("participation")}
        >
          Participation
        </button>
        <button
          className={tab === "requests" ? "active" : ""}
          aria-current={tab === "requests" ? "page" : undefined}
          onClick={() => setTab("requests")}
        >
          Requests
        </button>
      </nav>
    </main>
  );
}

function formatTime(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
function beep() {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 660;
  gain.gain.setValueAtTime(0.12, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.25);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.25);
}
