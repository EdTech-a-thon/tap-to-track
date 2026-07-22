import { useEffect, useState } from "react";
import { dataStore, RequestError } from "../data";
import { useApp } from "../state";
import type { ClassRoom, Period, PeriodType } from "../types";
import { setTodayNavigationIntent } from "../navigation";

type CalendarData = {
  classes: ClassRoom[];
  periods: (Period & { className: string })[];
};

export function ClassCalendar({ onClose, embedded = false }: { onClose?: () => void; embedded?: boolean }) {
  const { classId, setClassId, setView, setSnapshot } = useApp();
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [data, setData] = useState<CalendarData>();
  const [selectedDate, setSelectedDate] = useState("");
  const [scope, setScope] = useState<"all" | "selected">("selected");
  const [selectedClasses, setSelectedClasses] = useState<string[]>(
    classId ? [classId] : [],
  );
  const [type, setType] = useState<PeriodType>("instructional");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<(Period & { className: string })>();
  const [message, setMessage] = useState("");
  const from = localDate(new Date(month.getFullYear(), month.getMonth(), 1));
  const to = localDate(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const load = () => dataStore.getCalendar(from, to).then(setData);
  useEffect(() => {
    void load();
  }, [from, to]);
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + days }, (_, index) =>
    index < firstDay ? null : index - firstDay + 1,
  );
  const entries = selectedDate
    ? (data?.periods.filter(
        (period) => period.startedAt.slice(0, 10) === selectedDate,
      ) ?? [])
    : [];
  const create = async () => {
    if (!selectedDate || (scope === "selected" && !selectedClasses.length))
      return;
    setBusy(true);
    await dataStore.createCalendarDays({
      date: selectedDate,
      scope,
      classIds: scope === "selected" ? selectedClasses : undefined,
      type,
      participationExpected: type === "instructional",
    });
    await load();
    setBusy(false);
  };
  const openClassDay = async (period: Period & { className: string }) => {
    setTodayNavigationIntent({ classId: period.classId, periodId: period.id });
    setClassId(period.classId);
    setView("today");
    setSnapshot(await dataStore.getSnapshot(period.classId, true));
    onClose?.();
  };
  const deleteClassDay = async () => {
    if (!deleting) return;
    setBusy(true); setMessage("");
    try {
      await dataStore.getSnapshot(deleting.classId, true);
      await dataStore.mutate(deleting.classId, `/classes/${deleting.classId}/periods/${deleting.id}`, "DELETE");
      await dataStore.sync();
      await load();
      if (deleting.classId === classId) setSnapshot(await dataStore.getSnapshot(classId, true));
      setDeleting(undefined);
    } catch (error) {
      setMessage(error instanceof RequestError && error.status === 409 ? "This class day now contains attendance or evidence and cannot be deleted. Open it to review or merge it instead." : error instanceof Error ? error.message : "The class day could not be deleted.");
    } finally { setBusy(false); }
  };

  return (
    <section
      className={embedded ? "calendar-embedded" : "calendar-overlay"}
      role={embedded ? undefined : "dialog"}
      aria-modal={embedded ? undefined : "true"}
      aria-label="Class day calendar"
    >
      <div className="calendar-shell card">
        <header className="calendar-header">
          <div>
            <p className="eyebrow">CLASS-DAY PLANNER</p>
            <h1>
              {month.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </h1>
          </div>
          <div className="button-row">
            <button
              className="secondary"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              Previous
            </button>
            <button
              className="secondary"
              onClick={() =>
                setMonth(
                  new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                )
              }
            >
              Today
            </button>
            <button
              className="secondary"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              Next
            </button>
            {!embedded && <button className="text-button" onClick={onClose}>Close</button>}
          </div>
        </header>
        <div className="calendar-layout">
          <div className="month-calendar">
            <div className="weekday-row">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="calendar-grid">
              {cells.map((day, index) => {
                if (!day)
                  return (
                    <span className="calendar-empty" key={`empty-${index}`} />
                  );
                const date = localDate(
                  new Date(month.getFullYear(), month.getMonth(), day),
                );
                const periods =
                  data?.periods.filter(
                    (period) => period.startedAt.slice(0, 10) === date,
                  ) ?? [];
                return (
                  <button
                    className={`calendar-day ${selectedDate === date ? "selected" : ""} ${date === localDate(new Date()) ? "today" : ""}`}
                    onClick={() => setSelectedDate(date)}
                    key={date}
                  >
                    <b>{day}</b>
                    <span>
                      {periods.slice(0, 3).map((period) => (
                        <i
                           className={period.status === "scheduled" ? "scheduled" : "held"}
                          title={period.className}
                          key={period.id}
                        >
                          {period.className}
                        </i>
                      ))}
                    </span>
                    {periods.length > 3 && (
                      <small>+{periods.length - 3} more</small>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <aside className="calendar-detail">
            <p className="eyebrow">
              {selectedDate
                ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString(
                    undefined,
                    { weekday: "long", month: "long", day: "numeric" },
                  )
                : "PICK A DATE"}
            </p>
            {!selectedDate ? (
              <p>Select a day to see or schedule class days.</p>
            ) : (
              <>
                <h2>{entries.length ? "Class days" : "Nothing scheduled"}</h2>
                {entries.map((period) => (
                  <div className="calendar-entry" key={period.id}>
                    <button className="calendar-entry-open" onClick={() => openClassDay(period)}>
                    <span>
                      <strong>{period.className}</strong>
                      <small>
                        {period.type?.replace("-", " ")}
                      </small>
                    </span><b>
                       {period.status === "scheduled"
                         ? "Scheduled"
                          : period.status === "live"
                           ? "In progress"
                          : "Held"}
                    </b></button>
                    {period.status !== "live" && <button className="text-button danger" onClick={() => { setDeleting(period); setMessage(""); }}>Delete</button>}
                  </div>
                ))}
                <div className="schedule-form">
                  <h3>Add a class day</h3>
                  <fieldset>
                    <legend>Who is this for?</legend>
                    <label>
                      <input
                        type="radio"
                        checked={scope === "all"}
                        onChange={() => setScope("all")}
                      />{" "}
                      All classes
                    </label>
                    <label>
                      <input
                        type="radio"
                        checked={scope === "selected"}
                        onChange={() => setScope("selected")}
                      />{" "}
                      Specific classes
                    </label>
                  </fieldset>
                  {scope === "selected" && (
                    <div className="class-checklist">
                      {data?.classes.map((room) => (
                        <label key={room.id}>
                          <input
                            type="checkbox"
                            checked={selectedClasses.includes(room.id)}
                            onChange={(event) =>
                              setSelectedClasses(
                                event.target.checked
                                  ? [...selectedClasses, room.id]
                                  : selectedClasses.filter(
                                      (id) => id !== room.id,
                                    ),
                              )
                            }
                          />
                          {room.name}
                        </label>
                      ))}
                    </div>
                  )}
                  <label>
                    Activity type
                    <select
                      value={type}
                      onChange={(event) =>
                        setType(event.target.value as PeriodType)
                      }
                    >
                      <option value="instructional">Instructional</option>
                      <option value="independent">Independent work</option>
                      <option value="assessment">Assessment</option>
                      <option value="no-participation">
                        No participation expected
                      </option>
                    </select>
                  </label>
                  <button
                    className="primary"
                    disabled={
                      busy || (scope === "selected" && !selectedClasses.length)
                    }
                    onClick={create}
                  >
                    {busy
                      ? "Scheduling..."
                      : scope === "all"
                        ? "Add for all classes"
                        : `Add for ${selectedClasses.length} class${selectedClasses.length === 1 ? "" : "es"}`}
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      </div>
      {deleting && <div className="modal-backdrop"><section className="card modal" role="alertdialog" aria-modal="true"><h2>Delete {deleting.status === "scheduled" ? "scheduled " : ""}class day?</h2><p>Delete <strong>{deleting.className}: {deleting.label}</strong>? Only an empty {deleting.status === "scheduled" ? "scheduled" : "closed"} class day can be deleted.</p>{message && <p className="form-error" role="alert">{message}</p>}<div className="button-row"><button className="secondary" disabled={busy} onClick={() => setDeleting(undefined)}>Cancel</button><button className="danger-button" disabled={busy} onClick={() => void deleteClassDay()}>{busy ? "Deleting..." : `Delete empty ${deleting.status === "scheduled" ? "scheduled " : ""}day`}</button></div></section></div>}
    </section>
  );
}

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
