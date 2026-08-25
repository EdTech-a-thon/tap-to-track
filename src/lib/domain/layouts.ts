import { GRID, SEAT_SIZE, roomBounds } from "./seating";
import type { Box } from "./seating";

/**
 * Ready-made rooms offered the first time a teacher opens the chart, so thirty desks are
 * one tap rather than thirty. Everything here is only a starting point: every desk can be
 * dragged afterwards, which is why the shapes are plain and predictable.
 */

/** Generated desks sit on the grid in both directions, so "line desks up" leaves them alone. */
export const PITCH = SEAT_SIZE + GRID * 2 + 4;
/** Desks in a pair sit close; the gap left over between pairs is the aisle. */
const PAIR_GAP = SEAT_SIZE + GRID * 1.2;
const PAIR_PITCH = PITCH * 2;

export type Spot = { x: number; y: number };

export type LayoutChoice = {
  id: string;
  name: string;
  /** One line about the room it suits, so a teacher can choose without counting desks. */
  hint: string;
  seats: Spot[];
};

/** The most desks a room can be built with in one go. Beyond this, add them by hand. */
export const MAX_DESKS = 60;

export function deskCount(value: number): number {
  return Math.min(MAX_DESKS, Math.max(1, Math.round(value) || 1));
}

/**
 * How many desks land in each row, given how many rows the room is meant to have: as even
 * as possible, with any spares in the front rows. Rows are what the shapes are chosen by —
 * few rows is a wide room, many rows a deep one.
 */
export function spreadRows(count: number, rows: number): number[] {
  const used = Math.max(1, Math.min(count, Math.round(rows)));
  const base = Math.floor(count / used);
  const spare = count % used;
  return Array.from({ length: used }, (_, row) => base + (row < spare ? 1 : 0));
}

/** Lays rows out one above the other, each row centred on the widest one. */
function rowsOfSeats(counts: number[], xAt: (index: number) => number): Spot[] {
  const rowWidth = (n: number) => (n ? xAt(n - 1) + SEAT_SIZE : 0);
  const widest = Math.max(...counts.map(rowWidth));
  return counts.flatMap((n, row) => {
    // Centring is snapped so a generated room stays on the grid it will be dragged on.
    const offset = Math.round((widest - rowWidth(n)) / 2 / GRID) * GRID;
    return Array.from({ length: n }, (_, index) => ({
      x: offset + xAt(index),
      y: row * PITCH,
    }));
  });
}

function grid(count: number, rows: number): Spot[] {
  return rowsOfSeats(spreadRows(count, rows), (index) => index * PITCH);
}

/** Pairs of desks with an aisle between each pair, which is how most rooms actually sit. */
function pods(count: number, rows: number): Spot[] {
  return rowsOfSeats(
    spreadRows(count, rows),
    (index) => Math.floor(index / 2) * PAIR_PITCH + (index % 2) * PAIR_GAP,
  );
}

/**
 * A U open towards the front, so everyone can see everyone. Too few desks to turn a corner
 * with is just a row.
 */
function horseshoe(count: number): Spot[] {
  if (count < 5) return grid(count, 1);
  // The two arms match, so an odd desk goes along the bottom rather than lengthening one side.
  const even = Math.max(2, Math.round(count / 2.6));
  const across = (count - even) % 2 ? even + 1 : even;
  const side = (count - across) / 2;
  return [
    ...Array.from({ length: side }, (_, index) => ({ x: 0, y: index * PITCH })),
    ...Array.from({ length: across }, (_, index) => ({
      x: (index + 1) * PITCH,
      y: side * PITCH,
    })),
    ...Array.from({ length: side }, (_, index) => ({
      x: (across + 1) * PITCH,
      y: index * PITCH,
    })),
  ];
}

/** The five rooms offered for a given number of desks, widest-first through to deepest. */
export function layoutChoices(desks: number): LayoutChoice[] {
  const count = deskCount(desks);
  // A square room has about √n rows; fewer rows makes it wider, more makes it deeper.
  const square = Math.sqrt(count);
  return [
    {
      id: "balanced",
      name: "Balanced grid",
      hint: "Even rows, about as wide as the room is deep.",
      seats: grid(count, Math.round(square)),
    },
    {
      id: "wide",
      name: "Wide rows",
      hint: "Long rows facing the front. Suits a room wider than it is deep.",
      seats: grid(count, Math.max(1, Math.floor(square / 1.6))),
    },
    {
      id: "deep",
      name: "Deep columns",
      hint: "Few desks per row, running back from the front.",
      seats: grid(count, Math.ceil(square * 1.6)),
    },
    {
      id: "pods",
      name: "Desks in pairs",
      hint: "Pairs sitting together, with an aisle to walk between them.",
      seats: pods(count, Math.round(square / 1.15)),
    },
    {
      id: "horseshoe",
      name: "Horseshoe",
      hint: "A U facing the front, open in the middle.",
      seats: horseshoe(count),
    },
  ];
}

/** The box a choice's desks fill, so a preview of it can be drawn to scale. */
export function choiceBounds(seats: Spot[]): Box {
  return roomBounds(
    seats.map((spot, index) => ({ id: String(index), ...spot })),
  );
}
