import type { Student } from "./types";

export type RosterDensity = "comfortable" | "compact" | "overview";
export type RosterFilter = "all" | "not-heard" | "check-in";
export type ManageRosterFilter = "active" | "archived" | "all";
export type ManageRosterSort = "name" | "enrollment";

export function rosterDuplicateRows(names: string[], existingNames: string[]) {
  const existing = new Set(existingNames.map(normalizeName));
  const counts = new Map<string, number>();
  names.forEach((name) => counts.set(normalizeName(name), (counts.get(normalizeName(name)) ?? 0) + 1));
  return names.map((name) => ({
    existing: existing.has(normalizeName(name)),
    upload: (counts.get(normalizeName(name)) ?? 0) > 1,
  }));
}

export function manageRoster(students: Student[], query: string, filter: ManageRosterFilter, sort: ManageRosterSort) {
  const search = normalizeName(query);
  return students
    .filter((student) =>
      (!search || normalizeName(student.displayName).includes(search) || student.tags.some((tag) => normalizeName(tag).includes(search))) &&
      (filter === "all" || (filter === "archived" ? student.archived : !student.archived)),
    )
    .sort((a, b) => sort === "enrollment"
      ? String(b.enrolledAt ?? "").localeCompare(String(a.enrolledAt ?? "")) || a.displayName.localeCompare(b.displayName)
      : a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base", numeric: true }));
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function rosterDensity(size: number, landscape = true): RosterDensity {
  return size > 60 || (landscape && size >= 25 && size <= 40) ? "overview" : size > 24 ? "compact" : "comfortable";
}
export const rosterDensityOrder: RosterDensity[] = ["overview", "compact", "comfortable"];
export function changeRosterDensity(current: RosterDensity, direction: -1 | 1) { const index = rosterDensityOrder.indexOf(current); return rosterDensityOrder[Math.max(0, Math.min(rosterDensityOrder.length - 1, index + direction))]; }
export function rosterDensityLabel(density: RosterDensity) { return density === "overview" ? "Whole class" : density === "compact" ? "Compact" : "Comfortable"; }

export function rosterInitials(students: Student[]) {
  return Array.from(
    new Set(students.map((student) => student.displayName.trim()[0]?.toLocaleUpperCase()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
}

export function firstStudentIdForInitial(students: Student[], initial: string) {
  const target = initial.toLocaleUpperCase();
  return students.find(
    (student) => student.displayName.trim()[0]?.toLocaleUpperCase() === target,
  )?.id;
}

export function exactStudentId(students: Student[], query: string) {
  const target = query.trim().toLocaleLowerCase();
  if (!target) return undefined;
  return students.find(
    (student) => student.displayName.trim().toLocaleLowerCase() === target,
  )?.id;
}

export function filterRoster(
  students: Student[],
  query: string,
  filter: RosterFilter,
  notHeard: ReadonlySet<string>,
  checkIn: ReadonlySet<string>,
) {
  const search = query.trim().toLocaleLowerCase();
  return students.filter(
    (student) =>
      (!search || student.displayName.toLocaleLowerCase().includes(search)) &&
      (filter === "all" ||
        (filter === "not-heard" && notHeard.has(student.id)) ||
        (filter === "check-in" && checkIn.has(student.id))),
  );
}
