import type { ClassRoom, Period } from "./types";

export type TodayClass = {
  classRoom: ClassRoom;
  period?: Period & { className: string };
  status: "scheduled" | "live" | "closed" | "unscheduled";
  action: "Start" | "Open" | "Review";
};

const statusOrder = { live: 0, scheduled: 1, closed: 2, unscheduled: 3 } as const;

export function todayClasses(
  classes: ClassRoom[],
  periods: (Period & { className: string })[],
): TodayClass[] {
  return classes
    .filter((classRoom) => !classRoom.settings.archived)
    .map((classRoom) => {
      const classPeriods = periods
        .filter((period) => period.classId === classRoom.id)
        .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.startedAt.localeCompare(a.startedAt));
      const period = classPeriods[0];
      const status = period?.status ?? "unscheduled";
      const action: TodayClass["action"] = status === "live" ? "Open" : status === "closed" ? "Review" : "Start";
      return {
        classRoom,
        period,
        status,
        action,
      };
    })
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.classRoom.name.localeCompare(b.classRoom.name));
}

export function localDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
