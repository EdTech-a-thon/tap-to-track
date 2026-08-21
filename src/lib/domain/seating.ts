import type { Seat } from "./types";

export const GRID = 20;
export const SEAT_SIZE = 96;

/** Seats snap while dragging, not in storage, so a snapped Layout is ordinary data. */
export function snap(value: number, snapping: boolean, grid = GRID): number {
  if (!snapping) return Math.round(value);
  return Math.round(value / grid) * grid;
}

/** Where a dragged Seat lands: snapped if snapping is on, never off the top or left. */
export function placeSeat(x: number, y: number, snapping: boolean): { x: number; y: number } {
  return { x: Math.max(0, snap(x, snapping)), y: Math.max(0, snap(y, snapping)) };
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

/** How far the Layout extends, so the canvas can be sized to hold all of it. */
export function layoutExtent(seats: Seat[]): { width: number; height: number } {
  const step = SEAT_SIZE + GRID * 2;
  return {
    width: Math.max(step * 6, ...seats.map((seat) => seat.x + SEAT_SIZE + GRID * 2)),
    height: Math.max(step * 4, ...seats.map((seat) => seat.y + SEAT_SIZE + GRID * 2)),
  };
}

/** The tight box the desks sit in, so a room can be centred and grown to fill a screen. */
export function seatBounds(seats: Seat[]): { x: number; y: number; width: number; height: number } {
  if (!seats.length) return { x: 0, y: 0, width: SEAT_SIZE, height: SEAT_SIZE };
  const x = Math.min(...seats.map((seat) => seat.x));
  const y = Math.min(...seats.map((seat) => seat.y));
  const width = Math.max(...seats.map((seat) => seat.x)) + SEAT_SIZE - x;
  const height = Math.max(...seats.map((seat) => seat.y)) + SEAT_SIZE - y;
  return { x, y, width, height };
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
