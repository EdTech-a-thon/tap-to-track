import { describe, expect, it } from "vitest";
import { supportSignal } from "../src/supportSignal.js";
import type { ReportSkill, ReportStudent } from "../src/types.js";

const student = {
  studentId: "student", displayName: "Learner", tags: [], enrolledAt: "2026-01-01", archived: false, archivedAt: null,
  enrolledPeriods: 5, attendedInstructionalExpectedPeriods: 5, participationEligiblePeriods: 5, participatedPeriods: 5,
  periodsSincePositive: 0, positives: 6, redirects: 0, absences: 0,
  achievementSummary: { total: 1, evidenceCount: 1, meetOrExceedCount: 1, requiresSupportCount: 0, notStartedCount: 0 }, masteryHistory: [], photoEvidenceCount: 0,
} satisfies ReportStudent;
const leaf = (achievement: "not_started" | "meets", requiresSupport = false): ReportSkill => ({
  id: "leaf", label: "Leaf", category: "", parentSkillId: null, isParent: false,
  achievements: [{ studentId: "student", achievement, requiresSupport }],
});
const settings = { participationWatchAfter: 2, participationCheckInAfter: 3 };

describe("supportSignal", () => {
  it("keeps a learner on track when count-based signals are clear", () => {
    expect(supportSignal(student, [leaf("meets")], settings)).toEqual({ level: "on-track", reasons: ["Positive Action recorded this eligible class day"] });
  });

  it("shows every transparent reason and checks in for a teacher support flag", () => {
    const result = supportSignal({ ...student, participatedPeriods: 2, periodsSincePositive: 2, absences: 1 }, [leaf("not_started", true)], settings);
    expect(result.level).toBe("check-in");
    expect(result.reasons).toEqual([
      "Positive Action days 2/5", "2 class days since Positive Action", "1 absence",
      "1/1 leaf achievements not started", "1 leaf achievement marked ◆ Requires support",
    ]);
  });

  it("uses watch for a single non-urgent count signal", () => {
    expect(supportSignal({ ...student, absences: 1 }, [leaf("meets")], settings)).toMatchObject({ level: "watch", reasons: ["1 absence"] });
  });

  it("does not flag check-in or watch when heard within the last two class days", () => {
    expect(supportSignal({ ...student, participatedPeriods: 2, periodsSincePositive: 1 }, [leaf("meets")], settings)).toEqual({ level: "on-track", reasons: ["No support signals in this range"] });
  });

  it("uses the configured participation levels without overriding other signals", () => {
    expect(supportSignal({ ...student, participatedPeriods: 0, periodsSincePositive: null }, [leaf("meets")], settings).level).toBe("check-in");
    expect(supportSignal({ ...student, participatedPeriods: 0, periodsSincePositive: null }, [leaf("meets")], { participationWatchAfter: null, participationCheckInAfter: null }).level).toBe("on-track");
  });
});
