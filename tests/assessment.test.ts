import { describe, expect, it } from "vitest";
import { achievementDisplay, achievementOptions, parentSummary, parentSummaryText, rapidAssessmentReducer } from "../src/assessment.js";
import type { Mastery, Skill } from "../src/types.js";

const skills = [
  { id: "parent", parentSkillId: null, label: "Writing" },
  { id: "one", parentSkillId: "parent", label: "Ideas" },
  { id: "two", parentSkillId: "parent", label: "Structure" },
] as Skill[];
const mastery = [
  { studentId: "student", skillId: "one", achievement: "meets", requiresSupport: true },
  { studentId: "student", skillId: "two", achievement: "not_started", requiresSupport: false },
] as Mastery[];

describe("achievement assessment helpers", () => {
  it("provides explicit labels and color-independent symbols", () => {
    expect(achievementOptions.map(({ symbol, label }) => `${symbol} ${label}`)).toEqual([
      "○ Not started", "▲ Approaching", "● Meets", "★ Exceeds",
    ]);
    expect(achievementDisplay("exceeds")).toEqual({ value: "exceeds", symbol: "★", label: "Exceeds" });
  });

  it("builds the canonical parent count summary from children only", () => {
    const summary = parentSummary(skills, mastery, "student", "parent");
    expect(summary).toEqual({ total: 2, evidenceCount: 1, meetOrExceedCount: 1, requiresSupportCount: 1, notStartedCount: 1 });
    expect(parentSummaryText(summary)).toBe("Evidence 1/2 · Meet/exceed 1/2 · Support 1 · Not started 1");
  });

  it("keeps rapid mode deliberate, undoable, and ephemeral", () => {
    let state = rapidAssessmentReducer({ status: "idle", target: "meets" }, { type: "choose-target", target: "exceeds" });
    state = rapidAssessmentReducer(state, { type: "start" });
    state = rapidAssessmentReducer(state, { type: "apply", studentId: "s1", previousAchievement: "approaching", previousRequiresSupport: true });
    expect(state).toMatchObject({ status: "active", target: "exceeds", last: { studentId: "s1" } });
    expect(rapidAssessmentReducer(state, { type: "undo" })).toEqual({ status: "active", target: "exceeds", last: undefined });
    expect(rapidAssessmentReducer(state, { type: "exit" })).toEqual({ status: "idle", target: "exceeds" });
  });
});
