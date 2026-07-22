import type { Achievement, Mastery, ParentSummary, Skill } from "./types";

export const achievementOptions: ReadonlyArray<{
  value: Achievement;
  symbol: string;
  label: string;
}> = [
  { value: "not_started", symbol: "○", label: "Not started" },
  { value: "approaching", symbol: "▲", label: "Approaching" },
  { value: "meets", symbol: "●", label: "Meets" },
  { value: "exceeds", symbol: "★", label: "Exceeds" },
];

export function achievementDisplay(achievement: Achievement) {
  return achievementOptions.find((option) => option.value === achievement)!;
}

export function assessableSkills(skills: Skill[]) {
  const parentIds = new Set(skills.filter((skill) => skill.parentSkillId).map((skill) => skill.parentSkillId));
  return skills.filter((skill) => Boolean(skill.parentSkillId) || !parentIds.has(skill.id));
}

export function parentSummary(
  skills: Skill[],
  mastery: Mastery[],
  studentId: string,
  parentSkillId: string,
): ParentSummary {
  const children = skills.filter((skill) => skill.parentSkillId === parentSkillId);
  const rows = children.map((skill) =>
    mastery.find((item) => item.studentId === studentId && item.skillId === skill.id),
  );
  return {
    total: children.length,
    evidenceCount: rows.filter((row) => row && row.achievement !== "not_started").length,
    meetOrExceedCount: rows.filter((row) => row?.achievement === "meets" || row?.achievement === "exceeds").length,
    requiresSupportCount: rows.filter((row) => row?.requiresSupport).length,
    notStartedCount: rows.filter((row) => !row || row.achievement === "not_started").length,
  };
}

export function parentSummaryText(summary: ParentSummary) {
  return `Evidence ${summary.evidenceCount}/${summary.total} · Meet/exceed ${summary.meetOrExceedCount}/${summary.total} · Support ${summary.requiresSupportCount} · Not started ${summary.notStartedCount}`;
}

export type RapidAssessmentState =
  | { status: "idle"; target: Achievement }
  | { status: "active"; target: Achievement; last?: { studentId: string; previousAchievement: Achievement; previousRequiresSupport: boolean } };

export type RapidAssessmentAction =
  | { type: "choose-target"; target: Achievement }
  | { type: "start" }
  | { type: "apply"; studentId: string; previousAchievement: Achievement; previousRequiresSupport: boolean }
  | { type: "undo" }
  | { type: "exit" };

export function rapidAssessmentReducer(state: RapidAssessmentState, action: RapidAssessmentAction): RapidAssessmentState {
  switch (action.type) {
    case "choose-target":
      return { ...state, target: action.target };
    case "start":
      return { status: "active", target: state.target };
    case "apply":
      return state.status === "active" ? { ...state, last: action } : state;
    case "undo":
      return state.status === "active" ? { ...state, last: undefined } : state;
    case "exit":
      return { status: "idle", target: state.target };
  }
}
