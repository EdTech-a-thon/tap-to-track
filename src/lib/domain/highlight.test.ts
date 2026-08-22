import { expect, test } from "vitest";
import { seatShade, shadeColor, shadeStep } from "./highlight";
import type { Behavior, Tap } from "./types";

const behavior = (id: string, over: Partial<Behavior> = {}): Behavior =>
  ({ id, name: id, color: "#3d7ea6", position: 0, mode: "tally", ...over });
const tap = (id: string, behaviorId: string, studentId = "maya", at = "2026-01-01T09:00:00"): Tap =>
  ({ id, studentId, behaviorId, createdAt: at });

const TODAY = "2026-01-01";

const participation = behavior("participation");
const absent = behavior("absent", { mode: "toggle", away: true, color: "#5a615e" });
const all = [participation, absent];

test("shading climbs with the count and then stops", () => {
  expect(shadeStep(0)).toBe(0);
  expect(shadeStep(1)).toBe(1);
  expect(shadeStep(2)).toBe(2);
  expect(shadeStep(3)).toBe(3);
  expect(shadeStep(9)).toBe(3);
});

test("an unmarked Seat has no colour of its own", () => {
  expect(shadeColor("#3d7ea6", 0)).toBe(undefined);
});

test("shading uses the Behavior's own colour, at full strength once earned", () => {
  expect(shadeColor("#3d7ea6", 3)).toBe("#3d7ea6ff");
  expect(shadeColor("#3d7ea6", 1)).not.toBe(shadeColor("#3d7ea6", 2));
});

test("a student called on twice shades stronger than one called on once", () => {
  const once = seatShade([tap("1", "participation")], TODAY, "maya", participation, all);
  const twice = seatShade(
    [tap("1", "participation"), tap("2", "participation")], TODAY, "maya", participation, all);
  expect(once.color).not.toBe(twice.color);
});

test("an away student is grey whatever is highlighted", () => {
  const taps = [tap("1", "absent"), tap("2", "participation")];
  const shade = seatShade(taps, TODAY, "maya", participation, all);
  expect(shade.away).toBe(true);
  expect(shade.color).toBe("#5a615e");
});

test("with nothing highlighted, a present student's Seat is plain", () => {
  expect(seatShade([tap("1", "participation")], TODAY, "maya", null, all).color).toBe(undefined);
});

test("a new day starts everyone unmarked", () => {
  const yesterday = [tap("1", "participation", "maya", "2025-12-31T09:00:00")];
  expect(seatShade(yesterday, TODAY, "maya", participation, all).color).toBe(undefined);
});
