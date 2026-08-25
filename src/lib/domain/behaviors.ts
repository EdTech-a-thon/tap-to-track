import type { Behavior, BehaviorMode } from "./types";

/**
 * Six is a design limit, not a storage one: a popup a teacher has to read is a popup
 * that slows down a lesson.
 */
export const BEHAVIOR_LIMIT = 6;

export const BEHAVIOR_COLORS = [
  "#3d7ea6", "#2f7d5c", "#cf8a3f", "#8a4a6d", "#4c56a0", "#5a615e",
];

/**
 * Absent is not a Behavior a teacher writes: it is the one row with rules the rest of
 * the app relies on. It lasts the day rather than counting up, it greys the desk, and
 * while it is on nothing else can be recorded for that Student. Those rules only hold
 * if the name, the colour and the mode are fixed, so it is added whole or not at all.
 */
export const ABSENT_BEHAVIOR: {
  name: string; color: string; mode: BehaviorMode; away: true;
} = { name: "Absent", color: "#5a615e", mode: "toggle", away: true };

/** The Absent row, if the teacher has one. Only ever one — "away" is what marks it. */
export function absentBehavior(all: Behavior[]): Behavior | undefined {
  return all.find((behavior) => behavior.away);
}

/** What a teacher gets before they have configured anything. */
export const DEFAULT_BEHAVIORS: {
  name: string; color: string; mode: BehaviorMode; away?: boolean;
}[] = [
  { name: "Participation", color: "#3d7ea6", mode: "tally" },
  { name: "Positive behavior", color: "#2f7d5c", mode: "tally" },
  { name: "Redirect", color: "#cf8a3f", mode: "tally" },
  ABSENT_BEHAVIOR,
];

/** The Behaviors a Class shows on its popup, in the teacher's chosen order. */
export function behaviorsFor(all: Behavior[], enabledIds: string[]): Behavior[] {
  return all
    .filter((behavior) => enabledIds.includes(behavior.id))
    .sort((a, b) => a.position - b.position);
}
