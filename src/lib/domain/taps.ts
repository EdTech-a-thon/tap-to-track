import type { Behavior, Tap } from "./types";

/** How the popup arranges its buttons. Six is the most that stays hittable. */
export function popupGrid(count: number): { columns: number; rows: number } {
  if (count <= 1) return { columns: 1, rows: 1 };
  if (count === 2) return { columns: 2, rows: 1 };
  if (count === 3) return { columns: 3, rows: 1 };
  if (count === 4) return { columns: 2, rows: 2 };
  return { columns: 3, rows: 2 };
}

/** Every Tap for one Student in one Session. */
export function tapsFor(taps: Tap[], sessionId: string, studentId: string): Tap[] {
  return taps.filter((tap) => tap.sessionId === sessionId && tap.studentId === studentId);
}

/** How many times each Behavior has been recorded for a Student this Session. */
export function countsFor(taps: Tap[], sessionId: string, studentId: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const tap of tapsFor(taps, sessionId, studentId)) {
    counts[tap.behaviorId] = (counts[tap.behaviorId] ?? 0) + 1;
  }
  return counts;
}

/** A toggling Behavior is on when a Tap for it exists in this Session. */
export function isOn(taps: Tap[], sessionId: string, studentId: string, behaviorId: string): boolean {
  return tapsFor(taps, sessionId, studentId).some((tap) => tap.behaviorId === behaviorId);
}

/** A Student is away when a Behavior marked as "away" is toggled on for them. */
export function isAway(
  taps: Tap[], sessionId: string, studentId: string, behaviors: Behavior[],
): boolean {
  return behaviors
    .filter((behavior) => behavior.away)
    .some((behavior) => isOn(taps, sessionId, studentId, behavior.id));
}

/**
 * What pressing a button does. A tallying Behavior always adds one. A toggling one adds
 * or removes. A Student who is away can only be brought back — recording participation
 * for someone who is not in the room would be a lie.
 */
export function resolveTap(
  taps: Tap[], sessionId: string, studentId: string, behavior: Behavior, behaviors: Behavior[],
): { action: "add" } | { action: "remove"; tapId: string } | { action: "refuse" } {
  const away = isAway(taps, sessionId, studentId, behaviors);
  if (away && !behavior.away) return { action: "refuse" };

  if (behavior.mode === "tally") return { action: "add" };

  const existing = tapsFor(taps, sessionId, studentId)
    .find((tap) => tap.behaviorId === behavior.id);
  return existing ? { action: "remove", tapId: existing.id } : { action: "add" };
}
