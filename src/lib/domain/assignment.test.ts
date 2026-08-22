import { expect, test } from "vitest";
import { seatDeletionImpact, seatStudent, unseatStudent, unseatedIn } from "./assignment";
import type { Student } from "./types";

const student = (id: string, classId: string, seatId: string | null): Student =>
  ({ id, classId, name: id, seatId });

test("a Student dragged onto an empty Seat takes it", () => {
  const after = seatStudent([student("maya", "p2", null)], "maya", "s1");
  expect(after[0].seatId).toBe("s1");
});

test("a Student dropped onto an occupied Seat swaps with whoever was there", () => {
  const before = [student("maya", "p2", "s1"), student("sam", "p2", "s2")];
  const after = seatStudent(before, "maya", "s2");
  expect(after.find((s) => s.id === "maya")?.seatId).toBe("s2");
  expect(after.find((s) => s.id === "sam")?.seatId).toBe("s1");
});

test("swapping with an unseated Student leaves the displaced one unseated", () => {
  const before = [student("maya", "p2", null), student("sam", "p2", "s2")];
  const after = seatStudent(before, "maya", "s2");
  expect(after.find((s) => s.id === "sam")?.seatId).toBe(null);
});

test("a Seat occupied in another Class is not treated as taken", () => {
  const before = [student("maya", "p2", null), student("sam", "p6", "s1")];
  const after = seatStudent(before, "maya", "s1");
  expect(after.find((s) => s.id === "maya")?.seatId).toBe("s1");
  expect(after.find((s) => s.id === "sam")?.seatId).toBe("s1");
});

test("unseating keeps the Student on the roster", () => {
  const after = unseatStudent([student("maya", "p2", "s1")], "maya");
  expect(after[0]).toMatchObject({ id: "maya", classId: "p2", seatId: null });
});

test("deleting a Seat reports how many Classes it would disturb", () => {
  const students = [
    student("maya", "p2", "s1"),
    student("sam", "p6", "s1"),
    student("kai", "p2", "s2"),
  ];
  const impact = seatDeletionImpact(students, "s1");
  expect(impact.classCount).toBe(2);
  expect(impact.students.map((s) => s.id)).toEqual(["maya", "sam"]);
});

test("deleting an empty Seat disturbs nobody", () => {
  expect(seatDeletionImpact([student("maya", "p2", "s1")], "s9").classCount).toBe(0);
});

test("the unseated list is per Class", () => {
  const students = [student("maya", "p2", null), student("sam", "p6", null)];
  expect(unseatedIn(students, "p2").map((s) => s.id)).toEqual(["maya"]);
});
