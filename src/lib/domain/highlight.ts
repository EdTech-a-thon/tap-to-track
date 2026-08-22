import { countsFor, isAway } from "./taps";
import type { Behavior, Tap } from "./types";

/**
 * Four steps rather than marked/unmarked. Binary shading throws away the thing a teacher
 * most needs to see: the child called on six times looks identical to the one called on
 * once, which is exactly the imbalance the chart exists to reveal.
 */
export function shadeStep(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  return 3;
}

const STEP_ALPHA = ["00", "40", "80", "ff"];

/** The Behavior's own colour at the strength the count earns. */
export function shadeColor(color: string, step: 0 | 1 | 2 | 3): string | undefined {
  if (step === 0) return undefined;
  return `${color}${STEP_ALPHA[step]}`;
}

/**
 * What colour a Seat shows. Away always wins, whatever is highlighted — a teacher
 * glancing at "who haven't I called on" needs empty desks to read as empty, not as
 * neglected children.
 */
export function seatShade(
  taps: Tap[],
  sessionId: string | null,
  studentId: string,
  highlight: Behavior | null,
  behaviors: Behavior[],
): { color?: string; away: boolean } {
  if (!sessionId) return { away: false };
  if (isAway(taps, sessionId, studentId, behaviors)) {
    const marker = behaviors.find((behavior) => behavior.away);
    return { color: marker?.color ?? "#5a615e", away: true };
  }
  if (!highlight) return { away: false };
  const count = countsFor(taps, sessionId, studentId)[highlight.id] ?? 0;
  return { color: shadeColor(highlight.color, shadeStep(count)), away: false };
}
