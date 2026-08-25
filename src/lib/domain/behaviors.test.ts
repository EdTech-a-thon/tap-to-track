import { expect, test } from "vitest";
import {
  ABSENT_BEHAVIOR,
  BEHAVIOR_LIMIT,
  DEFAULT_BEHAVIORS,
  absentBehavior,
  behaviorsFor,
} from "./behaviors";
import type { Behavior } from "./types";

const make = (id: string, position: number): Behavior => ({
  id,
  name: id,
  color: "#000",
  mode: "tally",
  position,
});

test("a Class shows only the Behaviors it has enabled, in order", () => {
  const all = [make("c", 2), make("a", 0), make("b", 1)];
  expect(behaviorsFor(all, ["b", "a"]).map((b) => b.id)).toEqual(["a", "b"]);
});

test("a Class with nothing enabled shows nothing", () => {
  expect(behaviorsFor([make("a", 0)], [])).toEqual([]);
});

test("the defaults fit inside the limit and absence toggles rather than counting", () => {
  expect(DEFAULT_BEHAVIORS.length).toBeLessThanOrEqual(BEHAVIOR_LIMIT);
  expect(DEFAULT_BEHAVIORS.find((b) => b.name === "Absent")?.mode).toBe(
    "toggle",
  );
});

test("the Absent row is found by its rule, not by its name", () => {
  const all = [
    make("a", 0),
    { ...make("absent", 1), name: "Absent", away: true },
  ];
  expect(absentBehavior(all)?.id).toBe("absent");
  expect(absentBehavior([make("a", 0)])).toBeUndefined();
});

test("Absent comes with the rules the chart relies on", () => {
  expect(ABSENT_BEHAVIOR.away).toBe(true);
  expect(ABSENT_BEHAVIOR.mode).toBe("toggle");
  expect(DEFAULT_BEHAVIORS).toContain(ABSENT_BEHAVIOR);
});
