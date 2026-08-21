import { expect, test } from "vitest";
import { GRID, snap } from "./seating";

test("snapping pulls a dragged position onto the nearest grid line", () => {
  expect(snap(0, true)).toBe(0);
  expect(snap(GRID - 1, true)).toBe(GRID);
  expect(snap(GRID * 2 + 4, true)).toBe(GRID * 2);
});

test("releasing snapping keeps the position where it was dropped", () => {
  expect(snap(37, false)).toBe(37);
  expect(snap(37.4, false)).toBe(37);
});
