import { expect, test } from "vitest";
import { countsFor, isAway, isOn, popupGrid, resolveTap } from "./taps";
import type { Behavior, Tap } from "./types";

const behavior = (id: string, over: Partial<Behavior> = {}): Behavior =>
  ({ id, name: id, color: "#000", mode: "tally", position: 0, ...over });
const tap = (id: string, behaviorId: string, studentId = "maya", sessionId = "s1"): Tap =>
  ({ id, sessionId, studentId, behaviorId, createdAt: "2026-01-01T09:00:00.000Z" });

const participation = behavior("participation");
const absent = behavior("absent", { mode: "toggle", away: true });
const onTask = behavior("onTask", { mode: "toggle" });
const all = [participation, absent, onTask];

test("the popup grid stays hittable at every size", () => {
  expect(popupGrid(1)).toEqual({ columns: 1, rows: 1 });
  expect(popupGrid(2)).toEqual({ columns: 2, rows: 1 });
  expect(popupGrid(3)).toEqual({ columns: 3, rows: 1 });
  expect(popupGrid(4)).toEqual({ columns: 2, rows: 2 });
  expect(popupGrid(5)).toEqual({ columns: 3, rows: 2 });
  expect(popupGrid(6)).toEqual({ columns: 3, rows: 2 });
});

test("counts are per Student per Session", () => {
  const taps = [tap("1", "participation"), tap("2", "participation"), tap("3", "participation", "sam")];
  expect(countsFor(taps, "s1", "maya")).toEqual({ participation: 2 });
});

test("taps from another Session are not counted in this one", () => {
  expect(countsFor([tap("1", "participation", "maya", "earlier")], "s1", "maya")).toEqual({});
});

test("a tallying Behavior adds one every time", () => {
  const taps = [tap("1", "participation")];
  expect(resolveTap(taps, "s1", "maya", participation, all)).toEqual({ action: "add" });
});

test("a toggling Behavior turns on, then off again", () => {
  expect(resolveTap([], "s1", "maya", onTask, all)).toEqual({ action: "add" });
  const on = [tap("t1", "onTask")];
  expect(resolveTap(on, "s1", "maya", onTask, all)).toEqual({ action: "remove", tapId: "t1" });
  expect(isOn(on, "s1", "maya", "onTask")).toBe(true);
});

test("a Student marked away is away", () => {
  expect(isAway([tap("t1", "absent")], "s1", "maya", all)).toBe(true);
  expect(isAway([], "s1", "maya", all)).toBe(false);
});

test("a Student who is away cannot be recorded for anything else", () => {
  const taps = [tap("t1", "absent")];
  expect(resolveTap(taps, "s1", "maya", participation, all)).toEqual({ action: "refuse" });
  expect(resolveTap(taps, "s1", "maya", onTask, all)).toEqual({ action: "refuse" });
});

test("a Student who is away can always be brought back", () => {
  const taps = [tap("t1", "absent")];
  expect(resolveTap(taps, "s1", "maya", absent, all)).toEqual({ action: "remove", tapId: "t1" });
});

test("being away in an earlier Session does not lock this one", () => {
  const taps = [tap("t1", "absent", "maya", "earlier")];
  expect(resolveTap(taps, "s1", "maya", participation, all)).toEqual({ action: "add" });
});
