import { expect, test } from "vitest";
import { GRID, SEAT_SIZE, layoutExtent, nextSeatSpot, placeSeat, snap } from "./seating";
import type { Seat } from "./types";

const seat = (id: string, x: number, y: number): Seat => ({ id, x, y });

test("snapping pulls a dragged position onto the nearest grid line", () => {
  expect(snap(0, true)).toBe(0);
  expect(snap(GRID - 1, true)).toBe(GRID);
  expect(snap(GRID * 2 + 4, true)).toBe(GRID * 2);
});

test("releasing snapping keeps the position where it was dropped", () => {
  expect(snap(37, false)).toBe(37);
  expect(snap(37.4, false)).toBe(37);
});

test("a Seat dragged above or left of the room is kept inside it", () => {
  expect(placeSeat(-80, -10, true)).toEqual({ x: 0, y: 0 });
  expect(placeSeat(-80, -10, false)).toEqual({ x: 0, y: 0 });
});

test("a Seat dropped with snapping on lands on the grid", () => {
  expect(placeSeat(103, 57, true)).toEqual({ x: 100, y: 60 });
});

test("a Seat dropped with snapping off lands exactly where it was left", () => {
  expect(placeSeat(103, 57, false)).toEqual({ x: 103, y: 57 });
});

test("new Seats fill a row before starting the next one", () => {
  const step = SEAT_SIZE + GRID * 2;
  expect(nextSeatSpot([], 3)).toEqual({ x: 0, y: 0 });
  expect(nextSeatSpot([seat("a", 0, 0)], 3)).toEqual({ x: step, y: 0 });
  expect(nextSeatSpot([seat("a", 0, 0), seat("b", 0, 0), seat("c", 0, 0)], 3))
    .toEqual({ x: 0, y: step });
});

test("the room is at least a screenful, and grows to hold the furthest Seat", () => {
  const empty = layoutExtent([]);
  expect(empty.width).toBeGreaterThan(0);
  expect(layoutExtent([seat("a", 2000, 30)]).width).toBeGreaterThan(2000);
});
