import type { Behavior, Tap } from "./types";

/** How the popup arranges its buttons. Six is the most that stays hittable. */
export function popupGrid(count: number): { columns: number; rows: number } {
  if (count <= 1) return { columns: 1, rows: 1 };
  if (count === 2) return { columns: 2, rows: 1 };
  if (count === 3) return { columns: 3, rows: 1 };
  if (count === 4) return { columns: 2, rows: 2 };
  return { columns: 3, rows: 2 };
}

/**
 * The calendar day a moment falls on, in the teacher's own timezone. Counts and toggles
 * cover one day: tomorrow's lesson starts clean without anyone having to end today's.
 */
export function dayKey(when: string | Date): string {
  const date = typeof when === "string" ? new Date(when) : when;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Today, as the chart and popup show it. */
export function today(): string {
  return dayKey(new Date());
}

/**
 * The Taps the chart is currently showing. Clearing the chart between two lessons moves
 * this starting line forward instead of deleting anything: the desks read plain again,
 * while the reports still count everything that happened today. See ADR 0004.
 */
export function tapsSince(taps: Tap[], clearedAt: number | null): Tap[] {
  if (!clearedAt) return taps;
  return taps.filter((tap) => Date.parse(tap.createdAt) >= clearedAt);
}

/** Every Tap for one Student on one day. */
export function tapsFor(taps: Tap[], day: string, studentId: string): Tap[] {
  return taps.filter((tap) => tap.studentId === studentId && dayKey(tap.createdAt) === day);
}

/** How many times each Behavior has been recorded for a Student today. */
export function countsFor(taps: Tap[], day: string, studentId: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const tap of tapsFor(taps, day, studentId)) {
    counts[tap.behaviorId] = (counts[tap.behaviorId] ?? 0) + 1;
  }
  return counts;
}

/** A toggling Behavior is on when a Tap for it exists on this day. */
export function isOn(taps: Tap[], day: string, studentId: string, behaviorId: string): boolean {
  return tapsFor(taps, day, studentId).some((tap) => tap.behaviorId === behaviorId);
}

/** A Student is away when a Behavior marked as "away" is toggled on for them. */
export function isAway(
  taps: Tap[], day: string, studentId: string, behaviors: Behavior[],
): boolean {
  return behaviors
    .filter((behavior) => behavior.away)
    .some((behavior) => isOn(taps, day, studentId, behavior.id));
}

/**
 * What pressing a button does. A tallying Behavior always adds one. A toggling one adds
 * or removes. A Student who is away can only be brought back — recording participation
 * for someone who is not in the room would be a lie.
 */
export function resolveTap(
  taps: Tap[], day: string, studentId: string, behavior: Behavior, behaviors: Behavior[],
): { action: "add" } | { action: "remove"; tapId: string } | { action: "refuse" } {
  const away = isAway(taps, day, studentId, behaviors);
  if (away && !behavior.away) return { action: "refuse" };

  if (behavior.mode === "tally") return { action: "add" };

  const existing = tapsFor(taps, day, studentId)
    .find((tap) => tap.behaviorId === behavior.id);
  return existing ? { action: "remove", tapId: existing.id } : { action: "add" };
}
