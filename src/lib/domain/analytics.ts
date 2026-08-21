import type { Behavior, Class, Student, Tap } from "./types";

export type Window = "week" | "month" | "all";

export type Row = {
  studentId: string;
  studentName: string;
  className: string;
  counts: Record<string, number>;
  total: number;
};

/** Rolling, not calendar: "this week" on a Monday morning would be an empty column. */
export function windowStart(window: Window, now: number): number | null {
  if (window === "all") return null;
  const days = window === "week" ? 7 : 30;
  return now - days * 24 * 60 * 60 * 1000;
}

/**
 * One row per Student, including Students with no Taps at all — the children being
 * overlooked are the point of looking.
 */
export function aggregate(
  { taps, students, classes, behaviorIds, classIds, window, now }: {
    taps: Tap[];
    students: Student[];
    classes: Class[];
    behaviorIds: string[];
    classIds: string[];
    window: Window;
    now: number;
  },
): Row[] {
  const from = windowStart(window, now);
  const className = new Map(classes.map((cls) => [cls.id, cls.name]));
  const inScope = students.filter((student) => classIds.includes(student.classId));
  const wanted = new Set(behaviorIds);

  const counted = taps.filter((tap) =>
    wanted.has(tap.behaviorId) && (from === null || Date.parse(tap.createdAt) >= from));

  return inScope.map((student) => {
    const counts: Record<string, number> = {};
    for (const id of behaviorIds) counts[id] = 0;
    let total = 0;
    for (const tap of counted) {
      if (tap.studentId !== student.id) continue;
      counts[tap.behaviorId] += 1;
      total += 1;
    }
    return {
      studentId: student.id,
      studentName: student.name,
      className: className.get(student.classId) ?? "",
      counts,
      total,
    };
  });
}

export type SortKey = { column: "student" | "class" | string; descending: boolean };

export function sortRows(rows: Row[], sort: SortKey): Row[] {
  const value = (row: Row) =>
    sort.column === "student" ? row.studentName
      : sort.column === "class" ? row.className
      : row.counts[sort.column] ?? 0;
  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const order = typeof left === "string" && typeof right === "string"
      ? left.localeCompare(right)
      : Number(left) - Number(right);
    return sort.descending ? -order : order;
  });
}

/** The visible table, exactly as shown, so what gets shared matches what was seen. */
export function toCsv(rows: Row[], behaviors: Behavior[]): string {
  const header = ["Student", "Class", ...behaviors.map((behavior) => behavior.name)];
  const lines = rows.map((row) => [
    row.studentName,
    row.className,
    ...behaviors.map((behavior) => String(row.counts[behavior.id] ?? 0)),
  ]);
  return [header, ...lines].map((cells) => cells.map(escapeCell).join(",")).join("\n");
}

function escapeCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
