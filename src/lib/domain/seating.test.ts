import { expect, test } from "vitest";
import {
  ANCHOR_MIN,
  GRID,
  SEAT_SIZE,
  canvasBounds,
  fitScale,
  layoutExtent,
  nextAnchorSpot,
  nextSeatSpot,
  placeSeat,
  roomBounds,
  sizeAnchor,
  snap,
} from "./seating";
import type { Anchor, Seat } from "./types";

const seat = (id: string, x: number, y: number): Seat => ({ id, x, y });
const anchor = (
  id: string,
  x: number,
  y: number,
  width = 200,
  height = 80,
): Anchor => ({ id, x, y, width, height, label: id });

test("snapping pulls a dragged position onto the nearest grid line", () => {
  expect(snap(0, true)).toBe(0);
  expect(snap(GRID - 1, true)).toBe(GRID);
  expect(snap(GRID * 2 + 4, true)).toBe(GRID * 2);
});

test("releasing snapping keeps the position where it was dropped", () => {
  expect(snap(37, false)).toBe(37);
  expect(snap(37.4, false)).toBe(37);
});

test("a Seat can extend the room upward or leftward", () => {
  expect(placeSeat(-80, -10, true)).toEqual({ x: -80, y: 0 });
  expect(placeSeat(-83, -11, false)).toEqual({ x: -83, y: -11 });
});

test("the editable floor includes room on every side of the furniture", () => {
  const floor = canvasBounds([seat("a", -200, -100), seat("b", 300, 200)]);
  expect(floor.x).toBeLessThan(-200);
  expect(floor.y).toBeLessThan(-100);
  expect(floor.x + floor.width).toBeGreaterThan(300 + SEAT_SIZE);
  expect(floor.y + floor.height).toBeGreaterThan(200 + SEAT_SIZE);
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
  expect(
    nextSeatSpot([seat("a", 0, 0), seat("b", 0, 0), seat("c", 0, 0)], 3),
  ).toEqual({ x: 0, y: step });
});

test("the room is at least a screenful, and grows to hold the furthest Seat", () => {
  const empty = layoutExtent([]);
  expect(empty.width).toBeGreaterThan(0);
  expect(layoutExtent([seat("a", 2000, 30)]).width).toBeGreaterThan(2000);
});

test("the room's own box ignores the empty floor around it", () => {
  expect(roomBounds([seat("a", 100, 60), seat("b", 300, 60)])).toEqual({
    x: 100,
    y: 60,
    width: 200 + SEAT_SIZE,
    height: SEAT_SIZE,
  });
});

test("an Anchor is part of the room, so the box and the canvas both hold it", () => {
  expect(
    roomBounds([seat("a", 100, 100)], [anchor("board", 0, 0, 400, 60)]),
  ).toEqual({ x: 0, y: 0, width: 400, height: 100 + SEAT_SIZE });
  expect(
    layoutExtent([seat("a", 0, 0)], [anchor("board", 0, 3000, 400, 60)]).height,
  ).toBeGreaterThan(3000);
});

test("a new Anchor is born below everything already in the room", () => {
  expect(nextAnchorSpot([], [])).toEqual({ x: 0, y: 0 });
  expect(nextAnchorSpot([seat("a", 0, 200)], []).y).toBeGreaterThan(
    200 + SEAT_SIZE,
  );
});

test("an Anchor resized to nothing keeps enough of itself to read", () => {
  expect(sizeAnchor(5, 5, false)).toEqual({
    width: ANCHOR_MIN,
    height: ANCHOR_MIN,
  });
  expect(sizeAnchor(313, 87, true)).toEqual({ width: 320, height: 80 });
  expect(sizeAnchor(313, 87, false)).toEqual({ width: 313, height: 87 });
});

test("a room grows to fill its space by the tighter of the two directions", () => {
  const room = { width: 400, height: 200 };
  expect(fitScale(room, { width: 840, height: 440 }, GRID)).toBe(2);
  expect(fitScale(room, { width: 2040, height: 440 }, GRID)).toBe(2);
});

test("a room in a space too small to measure is left at its own size", () => {
  expect(fitScale({ width: 400, height: 200 }, { width: 0, height: 0 })).toBe(
    1,
  );
});

test("one lonely desk does not swell to fill a wall", () => {
  expect(
    fitScale(
      { width: SEAT_SIZE, height: SEAT_SIZE },
      { width: 4000, height: 4000 },
    ),
  ).toBe(3);
});
