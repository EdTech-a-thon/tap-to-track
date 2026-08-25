import type { Anchor, Seat } from "./types";

export const GRID = 20;
export const SEAT_SIZE = 96;

/** A new Anchor is wider than it is tall, because most of them are walls and boards. */
export const ANCHOR_WIDTH = 200;
export const ANCHOR_HEIGHT = 80;
/** Small enough for "Door", never so small the word inside it disappears. */
export const ANCHOR_MIN = 60;

/** Anything drawn in the room: a Seat is one of these at a fixed size, an Anchor at its own. */
export type Box = { x: number; y: number; width: number; height: number };

export function seatBox(seat: Seat): Box {
  return { x: seat.x, y: seat.y, width: SEAT_SIZE, height: SEAT_SIZE };
}

/** Everything the room contains, so measuring it never forgets the Anchors. */
export function boxesOf(seats: Seat[], anchors: Anchor[] = []): Box[] {
  return [...seats.map(seatBox), ...anchors];
}

/** Seats snap while dragging, not in storage, so a snapped Layout is ordinary data. */
export function snap(value: number, snapping: boolean, grid = GRID): number {
  if (!snapping) return Math.round(value);
  return Math.round(value / grid) * grid;
}

/** Where a dragged Seat lands: snapped if snapping is on, never off the top or left. */
export function placeSeat(x: number, y: number, snapping: boolean): { x: number; y: number } {
  return { x: Math.max(0, snap(x, snapping)), y: Math.max(0, snap(y, snapping)) };
}

/** How big a dragged corner leaves an Anchor: on the grid, never too small to read. */
export function sizeAnchor(
  width: number,
  height: number,
  snapping: boolean,
): { width: number; height: number } {
  return {
    width: Math.max(ANCHOR_MIN, snap(width, snapping)),
    height: Math.max(ANCHOR_MIN, snap(height, snapping)),
  };
}

/**
 * Where a new Seat appears: to the right of the last one, wrapping onto a new row so a
 * teacher adding thirty desks gets something room-shaped rather than a single long line.
 */
export function nextSeatSpot(seats: Seat[], perRow = 6): { x: number; y: number } {
  const step = SEAT_SIZE + GRID * 2;
  const index = seats.length;
  return { x: (index % perRow) * step, y: Math.floor(index / perRow) * step };
}

/**
 * Where a new Anchor appears: clear of everything already in the room, so it is never
 * born underneath a desk. The teacher drags it to the wall it belongs against.
 */
export function nextAnchorSpot(seats: Seat[], anchors: Anchor[]): { x: number; y: number } {
  const boxes = boxesOf(seats, anchors);
  if (!boxes.length) return { x: 0, y: 0 };
  return { x: 0, y: Math.max(...boxes.map((box) => box.y + box.height)) + GRID * 2 };
}

/** How far the Layout extends, so the canvas can be sized to hold all of it. */
export function layoutExtent(seats: Seat[], anchors: Anchor[] = []): { width: number; height: number } {
  const step = SEAT_SIZE + GRID * 2;
  const boxes = boxesOf(seats, anchors);
  return {
    width: Math.max(step * 6, ...boxes.map((box) => box.x + box.width + GRID * 2)),
    height: Math.max(step * 4, ...boxes.map((box) => box.y + box.height + GRID * 2)),
  };
}

/** The tight box the room sits in, so it can be centred and grown to fill a screen. */
export function roomBounds(seats: Seat[], anchors: Anchor[] = []): Box {
  const boxes = boxesOf(seats, anchors);
  if (!boxes.length) return { x: 0, y: 0, width: SEAT_SIZE, height: SEAT_SIZE };
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
  };
}

/**
 * How much to grow the room to fill the space it is given: the same in both directions, so
 * the desks keep their shape and their spacing, and never so large that one desk fills a wall.
 */
export function fitScale(
  room: { width: number; height: number },
  box: { width: number; height: number },
  pad = GRID,
  max = 3,
): number {
  const width = box.width - pad * 2;
  const height = box.height - pad * 2;
  if (width <= 0 || height <= 0 || !room.width || !room.height) return 1;
  return Math.min(width / room.width, height / room.height, max);
}
