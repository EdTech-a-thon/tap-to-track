import { describe, expect, it } from "vitest";
import { applyOptimisticChange, reconcileOptimisticSnapshot } from "../src/data.js";
import type { ClassSnapshot } from "../src/types.js";

const snapshot: ClassSnapshot = {
  classRoom: { id: "class", name: "Class", activeLens: "participation", joinCode: "CODE", settings: { archived: false, layout: "grid", participationWatchAfter: 2, participationCheckInAfter: 3 }, createdAt: "now" },
  students: [{ id: "student", classId: "class", displayName: "Learner", avatar: { emoji: "🙂", color: "#fff", shape: "circle" }, tags: [], archived: false }],
  skills: [], mastery: [], periods: [], attendance: [], events: [], requestTypes: [], requests: [], tags: [],
};

describe("DataStore optimistic reconciliation", () => {
  it("applies a tap immediately without mutating the cached source", () => {
    const next = applyOptimisticChange(snapshot, "/classes/class/events", "POST", { studentId: "student", periodId: "period", type: "part+" });
    expect(snapshot.events).toHaveLength(0);
    expect(next.events).toHaveLength(1);
    expect(next.events[0]).toMatchObject({ studentId: "student", periodId: "period", type: "part+" });
  });

  it("replaces an optimistic attendance state using last-write-wins", () => {
    const absent = applyOptimisticChange(snapshot, "/classes/class/attendance/student", "PUT", { studentId: "student", periodId: "period", status: "absent" });
    const present = applyOptimisticChange(absent, "/classes/class/attendance/student", "PUT", { studentId: "student", periodId: "period", status: "present" });
    expect(present.attendance).toEqual([{ studentId: "student", periodId: "period", status: "present" }]);
  });

  it("does not invent a second skill during an optimistic skill request", () => {
    const next = applyOptimisticChange(snapshot, "/classes/class/skills", "POST", { label: "Explains reasoning" });
    expect(next.skills).toHaveLength(0);
    expect(snapshot.skills).toHaveLength(0);
  });

  it("updates achievement and support independently", () => {
    const existing: ClassSnapshot = {
      ...snapshot,
      mastery: [{ studentId: "student", skillId: "skill", achievement: "approaching", requiresSupport: true, updatedAt: "before" }],
    };
    const achievement = applyOptimisticChange(existing, "/classes/class/mastery/student/skill", "PUT", { studentId: "student", skillId: "skill", achievement: "meets", assessedAt: "after" });
    expect(achievement.mastery[0]).toMatchObject({ achievement: "meets", requiresSupport: true, updatedAt: "after" });
    const support = applyOptimisticChange(achievement, "/classes/class/mastery/student/skill", "PUT", { studentId: "student", skillId: "skill", requiresSupport: false, assessedAt: "later" });
    expect(support.mastery[0]).toMatchObject({ achievement: "meets", requiresSupport: false, updatedAt: "later" });
  });
  it("rolls back terminal failures while retaining other pending changes", () => {
    const failed = { id: "failed", method: "PUT", path: "/classes/class/attendance/student", body: { studentId: "student", periodId: "period", status: "absent" }, createdAt: 1, failedAt: 2 };
    const pending = { id: "pending", method: "POST", path: "/classes/class/events", body: { studentId: "student", periodId: "period", type: "part+" }, createdAt: 3 };
    const next = reconcileOptimisticSnapshot(snapshot, [failed, pending], "class");
    expect(next.attendance).toEqual([]);
    expect(next.events).toHaveLength(1);
  });
});
