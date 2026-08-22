import { expect, test } from "vitest";
import { countsFor, dayKey, isAway, isOn, popupGrid, resolveTap } from "./taps";
import type { Behavior, Tap } from "./types";

const behavior = (id: string, over: Partial<Behavior> = {}): Behavior =>
  ({ id, name: id, color: "#000", mode: "tally", position: 0, ...over });
const tap = (id: string, behaviorId: string, studentId = "maya", at = "2026-01-01T09:00:00"): Tap =>
  ({ id, studentId, behaviorId, createdAt: at });

const TODAY = "2026-01-01";
const YESTERDAY = "2025-12-31T09:00:00";

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

test("a day is the teacher's own calendar day, not UTC's", () => {
  expect(dayKey("2026-01-01T09:00:00")).toBe("2026-01-01");
  expect(dayKey(new Date(2026, 8, 7, 23, 30))).toBe("2026-09-07");
});

test("counts are per Student per day", () => {
  const taps = [tap("1", "participation"), tap("2", "participation"), tap("3", "participation", "sam")];
  expect(countsFor(taps, TODAY, "maya")).toEqual({ participation: 2 });
});

test("yesterday's taps are not counted today", () => {
  expect(countsFor([tap("1", "participation", "maya", YESTERDAY)], TODAY, "maya")).toEqual({});
});

test("a tallying Behavior adds one every time", () => {
  const taps = [tap("1", "participation")];
  expect(resolveTap(taps, TODAY, "maya", participation, all)).toEqual({ action: "add" });
});

test("a toggling Behavior turns on, then off again", () => {
  expect(resolveTap([], TODAY, "maya", onTask, all)).toEqual({ action: "add" });
  const on = [tap("t1", "onTask")];
  expect(resolveTap(on, TODAY, "maya", onTask, all)).toEqual({ action: "remove", tapId: "t1" });
  expect(isOn(on, TODAY, "maya", "onTask")).toBe(true);
});

test("a Student marked away is away", () => {
  expect(isAway([tap("t1", "absent")], TODAY, "maya", all)).toBe(true);
  expect(isAway([], TODAY, "maya", all)).toBe(false);
});

test("a Student who is away cannot be recorded for anything else", () => {
  const taps = [tap("t1", "absent")];
  expect(resolveTap(taps, TODAY, "maya", participation, all)).toEqual({ action: "refuse" });
  expect(resolveTap(taps, TODAY, "maya", onTask, all)).toEqual({ action: "refuse" });
});

test("a Student who is away can always be brought back", () => {
  const taps = [tap("t1", "absent")];
  expect(resolveTap(taps, TODAY, "maya", absent, all)).toEqual({ action: "remove", tapId: "t1" });
});

test("being away yesterday does not lock today", () => {
  const taps = [tap("t1", "absent", "maya", YESTERDAY)];
  expect(resolveTap(taps, TODAY, "maya", participation, all)).toEqual({ action: "add" });
});
