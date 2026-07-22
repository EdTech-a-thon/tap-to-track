import { useEffect, useRef, useState } from "react";
import { dataStore } from "../data";
import { useApp } from "../state";
import { localDay, todayClasses, type TodayClass } from "../todayFlow";
import type { ClassRoom, PeriodType } from "../types";
import { Live } from "./Live";
import { takeTodayNavigationIntent } from "../navigation";

type CalendarData = Awaited<ReturnType<typeof dataStore.getCalendar>>;
type Workspace = { classId: string; periodId: string };

const activityTypes: { type: PeriodType; title: string; description: string }[] = [
  { type: "instructional", title: "Instructional", description: "Discussion and guided learning. Participation tracking is on." },
  { type: "independent", title: "Independent work", description: "Learners work individually. Participation tracking is off." },
  { type: "assessment", title: "Assessment", description: "Use skills and attendance without participation expectations." },
  { type: "no-participation", title: "No participation", description: "Attendance or class notes only. Participation tracking is off." },
];

export function Today() {
  const { classId, setClassId, setSnapshot, setError } = useApp();
  const [calendar, setCalendar] = useState<CalendarData>();
  const [workspace, setWorkspace] = useState<Workspace>();
  const [starting, setStarting] = useState<TodayClass>();
  const [busy, setBusy] = useState(false);
  const previousClassId = useRef(classId);
  const day = localDay();

  const load = () => dataStore.getCalendar(day, day).then(setCalendar);
  useEffect(() => { void load().catch((error) => setError(error.message)); }, [day]);
  useEffect(() => {
    const intent = takeTodayNavigationIntent();
    if (!intent || intent.classId !== classId) return;
    void dataStore.getSnapshot(intent.classId, true).then((snapshot) => {
      const period = snapshot.periods.find((item) => item.id === intent.periodId);
      if (!period) throw new Error("That class day could not be found.");
      setSnapshot(snapshot);
      setWorkspace({ classId: intent.classId, periodId: period.id });
    }).catch((error) => setError(error instanceof Error ? error.message : "That class day could not be opened."));
  }, [classId]);
  useEffect(() => {
    if (workspace && classId !== workspace.classId) setWorkspace(undefined);
  }, [classId]);
  useEffect(() => {
    const switchedClass = previousClassId.current !== classId;
    previousClassId.current = classId;
    if (!switchedClass || !classId) return;

    void dataStore.getSnapshot(classId, true).then((snapshot) => {
      setSnapshot(snapshot);
      const period = snapshot.periods.find((item) => item.status === "live") ?? snapshot.periods[0];
      setWorkspace({ classId, periodId: period?.id ?? "" });
    }).catch((error) => setError(error instanceof Error ? error.message : "That class could not be opened."));
  }, [classId, setError, setSnapshot]);

  const open = async (item: TodayClass) => {
    if (!item.period) return setStarting(item);
    if (item.status === "scheduled") return setStarting(item);
    try {
      if (item.classRoom.id !== classId) setClassId(item.classRoom.id);
      const snapshot = await dataStore.getSnapshot(item.classRoom.id, true);
      setSnapshot(snapshot);
      const period = snapshot.periods.find((candidate) => candidate.id === item.period?.id) ?? item.period;
      setWorkspace({
        classId: item.classRoom.id,
        periodId: period.id,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "That class day could not be opened.");
    }
  };

  const start = async (type: PeriodType) => {
    if (!starting) return;
    setBusy(true);
    try {
      const room = starting.classRoom;
      if (room.id !== classId) setClassId(room.id);
      await dataStore.getSnapshot(room.id, true);
      if (starting.period) {
        await dataStore.mutate(room.id, `/classes/${room.id}/periods/${starting.period.id}`, "PATCH", {
          type,
          participationExpected: type === "instructional",
        });
        await dataStore.mutate(room.id, `/classes/${room.id}/periods/${starting.period.id}/start`, "POST");
      } else {
        await dataStore.mutate(room.id, `/classes/${room.id}/periods`, "POST", {
          label: new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
          type,
          participationExpected: type === "instructional",
        });
      }
      await dataStore.sync();
      const snapshot = await dataStore.getSnapshot(room.id, true);
      setSnapshot(snapshot);
      const period = starting.period
        ? snapshot.periods.find((candidate) => candidate.id === starting.period?.id)
        : snapshot.periods.find((candidate) => candidate.status === "live");
      if (!period) throw new Error("Today's class day could not be found.");
      setStarting(undefined);
      setWorkspace({ classId: room.id, periodId: period.id });
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "That class day could not be started.");
    } finally {
      setBusy(false);
    }
  };

  if (workspace) {
    return <Live initialPeriodId={workspace.periodId} onBack={() => { setWorkspace(undefined); void load(); }} />;
  }

  const items = calendar ? todayClasses(calendar.classes, calendar.periods) : [];
  return (
    <>
      <section className="today-heading">
        <div><p className="eyebrow">TODAY</p><h1>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h1></div>
        <p>Start teaching, continue a class in progress, or review a class day without losing sight of the rest of your schedule.</p>
      </section>
      {!calendar ? <div className="view-loading">Opening today...</div> : !items.length ? <EmptyToday /> : (
        <section className="today-class-list" aria-label="Today's classes">
          {items.map((item) => <TodayClassCard item={item} onOpen={() => void open(item)} key={item.classRoom.id} />)}
        </section>
      )}
      {starting && <StartClassDay classRoom={starting.classRoom} scheduled={Boolean(starting.period)} busy={busy} onClose={() => setStarting(undefined)} onStart={start} />}
    </>
  );
}

function TodayClassCard({ item, onOpen }: { item: TodayClass; onOpen: () => void }) {
  const detail = item.status === "live" ? "In progress now" : item.status === "scheduled" ? "Ready to start" : item.status === "closed" ? "Finished today" : "No class day scheduled";
  const status = item.status === "live" ? "In progress" : item.status === "unscheduled" ? "Unscheduled" : item.status[0].toUpperCase() + item.status.slice(1);
  return <article className={`today-class card ${item.status}`}><div className="today-class-status"><span>{status}</span><small>{detail}</small></div><div><h2>{item.classRoom.name}</h2><p>{item.period?.type ? activityTypes.find((activity) => activity.type === item.period?.type)?.title : "Choose an activity when you start"}</p></div><button className="primary" onClick={onOpen} aria-label={`${item.action} ${item.classRoom.name}`}>{item.action}</button></article>;
}

function StartClassDay({ classRoom, scheduled, busy, onClose, onStart }: { classRoom: ClassRoom; scheduled: boolean; busy: boolean; onClose: () => void; onStart: (type: PeriodType) => Promise<void> }) {
  const [type, setType] = useState<PeriodType>("instructional");
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="start-class-title"><section className="card start-class-dialog"><p className="eyebrow">START CLASS DAY</p><h2 id="start-class-title">What is {classRoom.name} doing today?</h2><p>{scheduled ? "Choose today's activity before starting the scheduled class day." : "This creates today's class day with no extra setup."}</p><fieldset className="activity-cards"><legend>Activity type</legend>{activityTypes.map((activity) => <label className={type === activity.type ? "selected" : ""} key={activity.type}><input type="radio" name="activity" value={activity.type} checked={type === activity.type} onChange={() => setType(activity.type)} /><span><strong>{activity.title}</strong><small>{activity.description}</small></span></label>)}</fieldset><div className="button-row"><button className="secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="primary" onClick={() => void onStart(type)} disabled={busy}>{busy ? "Starting..." : "Begin class"}</button></div></section></div>;
}

function EmptyToday() {
  return <section className="card empty"><h1>No classes yet</h1><p>Create a class in Classes, then it will appear here each day.</p></section>;
}
