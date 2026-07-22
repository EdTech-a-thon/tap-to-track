import type { Attendance, Event, Period, Student } from "./types";
import type { ClassSettings } from "./classSettings";
import { participationGuidanceLevel, type ParticipationGuidanceLevel } from "./participationGuidance";

export type ParticipationInsight = {
  studentId: string;
  periodsPresent: number;
  periodsParticipated: number;
  participationRate: number;
  periodsSinceParticipation: number | null;
  status: "needs-attention" | "building" | "regular" | "new";
  guidanceLevel: ParticipationGuidanceLevel;
  label: string;
};

export function participationInsights(
  students: Student[],
  periods: Period[],
  attendance: Attendance[],
  events: Event[],
  settings: Pick<ClassSettings, "participationWatchAfter" | "participationCheckInAfter">,
): ParticipationInsight[] {
  const ordered = periods.filter((period) => period.status !== "scheduled" && period.participationExpected !== false).sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
  const absent = new Set(
    attendance
      .filter((item) => item.status === "absent")
      .map((item) => `${item.periodId}\u0000${item.studentId}`),
  );
  const positive = new Set(
    events
      .filter((event) => event.type === "part+")
      .map((event) => `${event.periodId}\u0000${event.studentId}`),
  );
  return students.map((student) => {
    const presentPeriods = ordered.filter(
      (period) => period.startedAt >= (student.enrolledAt ?? "")
        && (!student.archivedAt || period.startedAt <= student.archivedAt)
        && !absent.has(`${period.id}\u0000${student.id}`),
    );
    const participated = presentPeriods.filter((period) =>
      positive.has(`${period.id}\u0000${student.id}`),
    );
    const lastIndex = presentPeriods.findIndex((period) =>
      positive.has(`${period.id}\u0000${student.id}`),
    );
    const periodsSinceParticipation = lastIndex < 0 ? null : lastIndex;
    const eligibleDaysSincePositive = periodsSinceParticipation ?? presentPeriods.length;
    const guidanceLevel = participationGuidanceLevel(eligibleDaysSincePositive, settings);
    const participationRate = presentPeriods.length
      ? Math.round((participated.length / presentPeriods.length) * 100)
      : 0;
    const status = guidanceLevel === "check-in"
      ? "needs-attention"
      : guidanceLevel === "watch"
        ? "building"
        : presentPeriods.length === 0
          ? "new"
          : "regular";
    const label =
      status === "regular"
        ? `${participated.length}/${presentPeriods.length} class days with a Positive Action`
        : periodsSinceParticipation === null
          ? "No Positive Action recorded yet"
          : periodsSinceParticipation === 0
            ? `Positive Action this class day · ${participated.length}/${presentPeriods.length} class days`
            : `${periodsSinceParticipation} class day${periodsSinceParticipation === 1 ? "" : "s"} since a Positive Action`;
    return {
      studentId: student.id,
      periodsPresent: presentPeriods.length,
      periodsParticipated: participated.length,
      participationRate,
      periodsSinceParticipation,
      guidanceLevel,
      status,
      label,
    };
  });
}
