// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { setTodayNavigationIntent, takeTodayNavigationIntent, teacherView } from "../src/navigation.js";

describe("teacher navigation", () => {
  it.each([
    ["live", "today"],
    ["progress", "insights"],
    ["manage", "classes"],
    ["today", "today"],
    ["classes", "classes"],
    ["insights", "insights"],
    [null, "today"],
    ["unknown", "today"],
  ])("maps %s to %s", (stored, expected) => {
    expect(teacherView(stored)).toBe(expected);
  });
  it("passes a class-day intent once", () => {
    setTodayNavigationIntent({ classId: "class", periodId: "period" });
    expect(takeTodayNavigationIntent()).toEqual({ classId: "class", periodId: "period" });
    expect(takeTodayNavigationIntent()).toBeUndefined();
  });
  it("passes a class-only intent from the class switcher", () => {
    setTodayNavigationIntent({ classId: "class-b" });
    expect(takeTodayNavigationIntent()).toEqual({ classId: "class-b" });
  });
});
