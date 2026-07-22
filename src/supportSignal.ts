import type { ReportSkill, ReportStudent } from "./types";
import type { ClassSettings } from "./classSettings";
import { participationGuidanceLevel } from "./participationGuidance";

export type SupportLevel = "check-in" | "watch" | "on-track";

export interface SupportSignal {
  level: SupportLevel;
  reasons: string[];
}

export function supportSignal(student: ReportStudent, skills: ReportSkill[], settings: Pick<ClassSettings, "participationWatchAfter" | "participationCheckInAfter">): SupportSignal {
  const leafRows = skills
    .filter((skill) => !skill.isParent)
    .map((skill) => skill.achievements?.find((row) => row.studentId === student.studentId))
    .filter((row) => row !== undefined);
  const notStarted = leafRows.filter((row) => row.achievement === "not_started").length;
  const support = leafRows.filter((row) => row.requiresSupport).length;
  const concerns: string[] = [];

  const eligibleDaysSincePositive = student.periodsSincePositive ?? student.participationEligiblePeriods;
  const participationLevel = participationGuidanceLevel(eligibleDaysSincePositive, settings);
  if (participationLevel !== "on-track" && student.participationEligiblePeriods > 0 && student.participatedPeriods < student.participationEligiblePeriods) {
    concerns.push(`Positive Action days ${student.participatedPeriods}/${student.participationEligiblePeriods}`);
  }
  if (participationLevel !== "on-track" && student.periodsSincePositive === null && student.participationEligiblePeriods > 0) {
    concerns.push("No Positive Action in this range");
  } else if (participationLevel !== "on-track" && student.periodsSincePositive !== null && student.periodsSincePositive > 0) {
    concerns.push(`${student.periodsSincePositive} class day${student.periodsSincePositive === 1 ? "" : "s"} since Positive Action`);
  }
  if (student.absences > 0) concerns.push(`${student.absences} absence${student.absences === 1 ? "" : "s"}`);
  if (notStarted > 0) concerns.push(`${notStarted}/${leafRows.length} leaf achievements not started`);
  if (support > 0) concerns.push(`${support} leaf achievement${support === 1 ? "" : "s"} marked ◆ Requires support`);

  const urgent = support > 0 || student.absences >= 2 || participationLevel === "check-in";
  const level: SupportLevel = urgent || concerns.length >= 3 ? "check-in" : concerns.length || participationLevel === "watch" ? "watch" : "on-track";
  return { level, reasons: concerns.length ? concerns : [eligibleDaysSincePositive === 0 ? "Positive Action recorded this eligible class day" : "No support signals in this range"] };
}
