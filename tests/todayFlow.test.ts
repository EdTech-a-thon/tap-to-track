import { describe, expect, it } from "vitest";
import { todayClasses } from "../src/todayFlow.js";
import type { ClassRoom, Period } from "../src/types.js";

const room = (id: string): ClassRoom => ({ id, name: `Class ${id}`, activeLens: "participation", joinCode: id, createdAt: "now", settings: { archived: false, layout: "grid", participationWatchAfter: 2, participationCheckInAfter: 3 } });
const period = (classId: string, status: Period["status"]): Period & { className: string } => ({ id: `${classId}-${status}`, classId, className: classId, label: "Today", startedAt: "2026-07-21T12:00:00Z", endedAt: status === "closed" ? "2026-07-21T13:00:00Z" : null, status, active: status === "live", attendanceCompletedAt: null, reopenedAt: null });

describe("Today class ordering", () => {
  it("shows every class with a contextual action and live classes first", () => {
    const result = todayClasses([room("closed"), room("none"), room("live"), room("scheduled")], [period("closed", "closed"), period("live", "live"), period("scheduled", "scheduled")]);
    expect(result.map(({ classRoom, status, action }) => [classRoom.id, status, action])).toEqual([
      ["live", "live", "Open"], ["scheduled", "scheduled", "Start"], ["closed", "closed", "Review"], ["none", "unscheduled", "Start"],
    ]);
  });
});
