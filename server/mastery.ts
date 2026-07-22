export type MasteryRow = Record<string, unknown>;

export const achievementLevels = ["not_started", "approaching", "meets", "exceeds"] as const;
export type Achievement = typeof achievementLevels[number];

export interface ParentSummary {
  total: number;
  evidenceCount: number;
  meetOrExceedCount: number;
  requiresSupportCount: number;
  notStartedCount: number;
}

export function leafAchievement(mastery: MasteryRow[], studentId: unknown, skillId: unknown): Achievement {
  const value = mastery.find((item) => item.studentId === studentId && item.skillId === skillId)?.achievement;
  return achievementLevels.includes(value as Achievement) ? value as Achievement : "not_started";
}

export function parentSummary(skills: MasteryRow[], mastery: MasteryRow[], studentId: unknown, parentSkillId: unknown): ParentSummary {
  const children = skills.filter((skill) => skill.parentSkillId === parentSkillId);
  const rows = children.map((child) => ({
    achievement: leafAchievement(mastery, studentId, child.id),
    requiresSupport: Boolean(mastery.find((item) => item.studentId === studentId && item.skillId === child.id)?.requiresSupport),
  }));
  return {
    total: rows.length,
    evidenceCount: rows.filter((row) => row.achievement !== "not_started").length,
    meetOrExceedCount: rows.filter((row) => row.achievement === "meets" || row.achievement === "exceeds").length,
    requiresSupportCount: rows.filter((row) => row.requiresSupport).length,
    notStartedCount: rows.filter((row) => row.achievement === "not_started").length,
  };
}

export function normalizedSkill(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
