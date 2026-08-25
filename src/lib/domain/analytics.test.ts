import { expect, test } from "vitest";
import { aggregate, sortRows, toCsv, windowStart } from "./analytics";
import type { Behavior, Class, Student, Tap } from "./types";

const NOW = Date.UTC(2026, 5, 30, 12);
const daysAgo = (days: number) =>
  new Date(NOW - days * 86_400_000).toISOString();

const classes: Class[] = [
  { id: "p2", name: "Period 2", behaviorIds: [] },
  { id: "p6", name: "Period 6", behaviorIds: [] },
];
const students: Student[] = [
  { id: "maya", classId: "p2", name: "Maya C", seatId: null },
  { id: "sam", classId: "p2", name: "Sam A", seatId: null },
  { id: "kai", classId: "p6", name: "Kai B", seatId: null },
];
const behaviors: Behavior[] = [
  {
    id: "participation",
    name: "Participation",
    color: "#000",
    mode: "tally",
    position: 0,
  },
  {
    id: "redirect",
    name: "Redirect",
    color: "#111",
    mode: "tally",
    position: 1,
  },
];
const tap = (
  id: string,
  studentId: string,
  behaviorId: string,
  days: number,
): Tap => ({ id, studentId, behaviorId, createdAt: daysAgo(days) });

const taps = [
  tap("1", "maya", "participation", 1),
  tap("2", "maya", "participation", 10),
  tap("3", "maya", "redirect", 40),
  tap("4", "kai", "participation", 2),
];

const run = (over: Partial<Parameters<typeof aggregate>[0]> = {}) =>
  aggregate({
    taps,
    students,
    classes,
    now: NOW,
    window: "all",
    behaviorIds: ["participation", "redirect"],
    classIds: ["p2", "p6"],
    ...over,
  });

test("windows are rolling, and all-time has no start", () => {
  expect(windowStart("all", NOW)).toBe(null);
  expect(windowStart("week", NOW)).toBe(NOW - 7 * 86_400_000);
  expect(windowStart("month", NOW)).toBe(NOW - 30 * 86_400_000);
});

test("counts are per Student per Behavior", () => {
  const maya = run().find((row) => row.studentId === "maya")!;
  expect(maya.counts).toEqual({ participation: 2, redirect: 1 });
});

test("a Student with no taps still appears, at zero", () => {
  const sam = run().find((row) => row.studentId === "sam")!;
  expect(sam.counts).toEqual({ participation: 0, redirect: 0 });
});

test("the last week counts only the last week", () => {
  const maya = run({ window: "week" }).find((row) => row.studentId === "maya")!;
  expect(maya.counts.participation).toBe(1);
});

test("the last month excludes what fell outside it", () => {
  const maya = run({ window: "month" }).find(
    (row) => row.studentId === "maya",
  )!;
  expect(maya.counts).toEqual({ participation: 2, redirect: 0 });
});

test("filtering to one Class drops the others entirely", () => {
  expect(run({ classIds: ["p6"] }).map((row) => row.studentId)).toEqual([
    "kai",
  ]);
});

test("filtering to one Behavior drops the other column", () => {
  const maya = run({ behaviorIds: ["redirect"] }).find(
    (row) => row.studentId === "maya",
  )!;
  expect(maya.counts).toEqual({ redirect: 1 });
});

test("each row carries the Class it belongs to, so a multi-class view still reads", () => {
  expect(run().map((row) => row.className)).toEqual([
    "Period 2",
    "Period 2",
    "Period 6",
  ]);
});

test("sorting by a Behavior column orders by that count", () => {
  const sorted = sortRows(run(), { column: "participation", descending: true });
  expect(sorted[0].studentId).toBe("maya");
});

test("sorting by name is alphabetical and reversible", () => {
  const up = sortRows(run(), { column: "student", descending: false });
  const down = sortRows(run(), { column: "student", descending: true });
  expect(up.map((row) => row.studentName)).toEqual([
    "Kai B",
    "Maya C",
    "Sam A",
  ]);
  expect(down.map((row) => row.studentName)).toEqual([
    "Sam A",
    "Maya C",
    "Kai B",
  ]);
});

test("the export carries the same rows and columns as the table", () => {
  const csv = toCsv(run({ classIds: ["p6"] }), behaviors);
  expect(csv).toBe("Student,Class,Participation,Redirect\nKai B,Period 6,1,0");
});

test("a name containing a comma survives the round trip", () => {
  const rows = [
    {
      studentId: "x",
      studentName: "Chen, Maya",
      className: "Period 2",
      counts: { participation: 1, redirect: 0 },
      total: 1,
    },
  ];
  expect(toCsv(rows, behaviors)).toContain('"Chen, Maya"');
});
