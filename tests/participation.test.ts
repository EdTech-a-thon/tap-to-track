import { describe, expect, it } from "vitest";
import { participationInsights } from "../src/participation";
import { participationGuidanceLevel } from "../src/participationGuidance";
import type { Attendance, Event, Period, Student } from "../src/types";

const student = { id: "student", classId: "class", displayName: "Learner", avatar: { emoji: "🙂", color: "#fff", shape: "circle" }, tags: [], archived: false, enrolledAt: "2026-07-01" } satisfies Student;
const periods = [0, 1, 2, 3].map((index) => ({ id: `p${index}`, classId: "class", label: `${index}`, startedAt: `2026-07-${20 - index}T00:00:00.000Z`, endedAt: null, status: "closed", active: false, participationExpected: true })) satisfies Period[];
const attendance = periods.map((period) => ({ periodId: period.id, studentId: student.id, status: "present" as const })) satisfies Attendance[];
const event = (periodId: string): Event => ({ id: periodId, classId: "class", studentId: student.id, periodId, type: "part+", timestamp: "2026-07-20T01:00:00.000Z" });
const settings = { participationWatchAfter: 2, participationCheckInAfter: 3 };

describe("participation guidance", () => {
  it("uses exact threshold boundaries", () => {
    expect(participationGuidanceLevel(1, settings)).toBe("on-track");
    expect(participationGuidanceLevel(2, settings)).toBe("watch");
    expect(participationGuidanceLevel(3, settings)).toBe("check-in");
  });

  it("allows either threshold to be disabled", () => {
    expect(participationGuidanceLevel(20, { participationWatchAfter: null, participationCheckInAfter: null })).toBe("on-track");
    expect(participationGuidanceLevel(3, { participationWatchAfter: null, participationCheckInAfter: 3 })).toBe("check-in");
  });

  it("flags no-positive-ever using the eligible day count", () => {
    expect(participationInsights([student], periods.slice(0, 2), attendance, [], settings)[0].guidanceLevel).toBe("watch");
    expect(participationInsights([student], periods.slice(0, 3), attendance, [], settings)[0].guidanceLevel).toBe("check-in");
  });

  it("does not count absent or participation-not-expected days", () => {
    const excluded = [{ ...attendance[0], status: "absent" as const }];
    const notExpected = periods.map((period, index) => index === 1 ? { ...period, participationExpected: false } : period);
    const insight = participationInsights([student], notExpected, excluded, [event("p3")], settings)[0];
    expect(insight.periodsPresent).toBe(2);
    expect(insight.periodsSinceParticipation).toBe(1);
    expect(insight.guidanceLevel).toBe("on-track");
  });
});
