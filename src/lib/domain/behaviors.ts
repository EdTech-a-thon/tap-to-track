import type { Behavior, BehaviorMode } from "./types";

/**
 * Six is a design limit, not a storage one: a popup a teacher has to read is a popup
 * that slows down a lesson.
 */
export const BEHAVIOR_LIMIT = 6;

export const BEHAVIOR_COLORS = [
  "#3d7ea6", "#2f7d5c", "#cf8a3f", "#8a4a6d", "#4c56a0", "#5a615e",
];

/** What a teacher gets before they have configured anything. */
export const DEFAULT_BEHAVIORS: {
  name: string; color: string; mode: BehaviorMode; away?: boolean;
}[] = [
  { name: "Participation", color: "#3d7ea6", mode: "tally" },
  { name: "Positive behavior", color: "#2f7d5c", mode: "tally" },
  { name: "Redirect", color: "#cf8a3f", mode: "tally" },
  // Absence lasts the whole day, so it toggles rather than counting up.
  { name: "Absent", color: "#5a615e", mode: "toggle", away: true },
];

/** The Behaviors a Class shows on its popup, in the teacher's chosen order. */
export function behaviorsFor(all: Behavior[], enabledIds: string[]): Behavior[] {
  return all
    .filter((behavior) => enabledIds.includes(behavior.id))
    .sort((a, b) => a.position - b.position);
}
