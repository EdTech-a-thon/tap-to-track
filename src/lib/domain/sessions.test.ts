import { expect, test } from "vitest";
import { endSession, formatElapsed, openSessionIn, startSession } from "./sessions";
import type { Session } from "./types";

const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 9, minutes)).toISOString();

test("with nothing open, nothing is recording", () => {
  expect(openSessionIn([])).toBe(null);
});

test("starting a Session opens it for the chosen Class", () => {
  const sessions = startSession([], "p2", "s1", at(0));
  expect(openSessionIn(sessions)).toMatchObject({ id: "s1", classId: "p2", endedAt: null });
});

test("starting a Session closes one that was left open", () => {
  const monday = startSession([], "p2", "s1", at(0));
  const tuesday = startSession(monday, "p6", "s2", at(60));
  expect(tuesday.find((s) => s.id === "s1")?.endedAt).toBe(at(60));
  expect(openSessionIn(tuesday)?.id).toBe("s2");
});

test("only one Session is ever open at a time", () => {
  let sessions: Session[] = [];
  sessions = startSession(sessions, "p2", "s1", at(0));
  sessions = startSession(sessions, "p2", "s2", at(10));
  sessions = startSession(sessions, "p2", "s3", at(20));
  expect(sessions.filter((session) => !session.endedAt)).toHaveLength(1);
});

test("ending a Session closes it", () => {
  const sessions = endSession(startSession([], "p2", "s1", at(0)), "s1", at(50));
  expect(openSessionIn(sessions)).toBe(null);
  expect(sessions[0].endedAt).toBe(at(50));
});

test("an ended Session cannot be reopened or re-closed", () => {
  const ended = endSession(startSession([], "p2", "s1", at(0)), "s1", at(50));
  expect(endSession(ended, "s1", at(90))[0].endedAt).toBe(at(50));
});

test("elapsed time reads as minutes and seconds", () => {
  expect(formatElapsed(0)).toBe("0:00");
  expect(formatElapsed(65_000)).toBe("1:05");
  expect(formatElapsed(3_600_000)).toBe("60:00");
});
