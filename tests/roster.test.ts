import { describe, expect, it } from "vitest";
import {
  exactStudentId,
  filterRoster,
  changeRosterDensity,
  firstStudentIdForInitial,
  rosterDensity,
  rosterInitials,
  manageRoster,
  rosterDuplicateRows,
} from "../src/roster";
import type { Student } from "../src/types";

const students = ["Ada", "Ben", "Cleo"].map((displayName, index) => ({
  id: String(index),
  classId: "class",
  displayName,
  avatar: { emoji: "🙂", color: "#fff", shape: "circle" },
  tags: [],
  archived: false,
})) as Student[];

describe("fluid roster helpers", () => {
  it("selects density from the full roster size", () => {
    expect(rosterDensity(1)).toBe("comfortable");
    expect(rosterDensity(24)).toBe("comfortable");
    expect(rosterDensity(25)).toBe("overview");
    expect(rosterDensity(40)).toBe("overview");
    expect(rosterDensity(25, false)).toBe("compact");
    expect(rosterDensity(40, false)).toBe("compact");
    expect(rosterDensity(41)).toBe("compact");
    expect(rosterDensity(60)).toBe("compact");
    expect(rosterDensity(61)).toBe("overview");
    expect(rosterDensity(100)).toBe("overview");
    expect(rosterDensity(500)).toBe("overview");
    expect(changeRosterDensity("comfortable", -1)).toBe("compact");
    expect(changeRosterDensity("compact", -1)).toBe("overview");
    expect(changeRosterDensity("overview", 1)).toBe("compact");
  });

  it("builds an alphabetical index and finds its first learner", () => {
    const unordered = [students[2], students[0], students[1]];
    expect(rosterInitials(unordered)).toEqual(["A", "B", "C"]);
    expect(firstStudentIdForInitial(unordered, "a")).toBe("0");
    expect(firstStudentIdForInitial(unordered, "Z")).toBeUndefined();
  });

  it("finds an exact learner without case or surrounding-space sensitivity", () => {
    expect(exactStudentId(students, "  cLEO ")).toBe("2");
    expect(exactStudentId(students, "Cle")).toBeUndefined();
    expect(exactStudentId(students, " ")).toBeUndefined();
  });

  it("combines name search and status without hiding unmatched statuses", () => {
    const result = filterRoster(
      students,
      "e",
      "not-heard",
      new Set(["1", "2"]),
      new Set(["0"]),
    );
    expect(result.map((student) => student.displayName)).toEqual(["Ben", "Cleo"]);
  });

  it("filters a 500-learner roster within an interaction frame", () => {
    const largeRoster = Array.from({ length: 500 }, (_, index) => ({
      ...students[0],
      id: String(index),
      displayName: `Learner ${index}`,
    }));
    const started = performance.now();
    let result: Student[] = [];
    for (let index = 0; index < 100; index++)
      result = filterRoster(largeRoster, "Learner 49", "all", new Set(), new Set());

    expect(result).toHaveLength(11);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("searches, filters, and sorts the roster management list", () => {
    const roster = [
      { ...students[0], displayName: "Zoe", enrolledAt: "2026-01-01T00:00:00.000Z" },
      { ...students[1], displayName: "Avery", enrolledAt: "2026-02-01T00:00:00.000Z", archived: true },
      { ...students[2], displayName: "Alex", enrolledAt: "2026-03-01T00:00:00.000Z" },
    ];
    expect(manageRoster(roster, "a", "all", "enrollment").map((student) => student.displayName)).toEqual(["Alex", "Avery"]);
    expect(manageRoster(roster, "", "active", "name").map((student) => student.displayName)).toEqual(["Alex", "Zoe"]);
  });

  it("flags upload and existing-name duplicates without removing them", () => {
    expect(rosterDuplicateRows([" Avery ", "Jordan", "avery"], ["AVERY", "Sam"])).toEqual([
      { existing: true, upload: true },
      { existing: false, upload: false },
      { existing: true, upload: true },
    ]);
  });
});
