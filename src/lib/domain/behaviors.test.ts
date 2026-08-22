import { expect, test } from "vitest";
import { BEHAVIOR_LIMIT, DEFAULT_BEHAVIORS, behaviorsFor } from "./behaviors";
import type { Behavior } from "./types";

const make = (id: string, position: number): Behavior =>
  ({ id, name: id, color: "#000", mode: "tally", position });

test("a Class shows only the Behaviors it has enabled, in order", () => {
  const all = [make("c", 2), make("a", 0), make("b", 1)];
  expect(behaviorsFor(all, ["b", "a"]).map((b) => b.id)).toEqual(["a", "b"]);
});

test("a Class with nothing enabled shows nothing", () => {
  expect(behaviorsFor([make("a", 0)], [])).toEqual([]);
});

test("the defaults fit inside the limit and absence toggles rather than counting", () => {
  expect(DEFAULT_BEHAVIORS.length).toBeLessThanOrEqual(BEHAVIOR_LIMIT);
  expect(DEFAULT_BEHAVIORS.find((b) => b.name === "Absent")?.mode).toBe("toggle");
});
