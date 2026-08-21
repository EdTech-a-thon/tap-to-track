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
