import { expect, test } from "vitest";
import { SEAT_SIZE } from "./seating";
import { choiceBounds, deskCount, layoutChoices, spreadRows } from "./layouts";

const ratio = (id: string, desks: number) => {
  const choice = layoutChoices(desks).find((option) => option.id === id)!;
  const box = choiceBounds(choice.seats);
  return box.width / box.height;
};

test("a room is asked for between one desk and a roomful", () => {
  expect(deskCount(0)).toBe(1);
  expect(deskCount(-4)).toBe(1);
  expect(deskCount(28)).toBe(28);
  expect(deskCount(28.4)).toBe(28);
  expect(deskCount(900)).toBe(60);
  expect(deskCount(NaN)).toBe(1);
});

test("desks spread evenly over the rows, spares in the front rows", () => {
  expect(spreadRows(30, 5)).toEqual([6, 6, 6, 6, 6]);
  expect(spreadRows(22, 4)).toEqual([6, 6, 5, 5]);
  expect(spreadRows(4, 1)).toEqual([4]);
  expect(spreadRows(3, 9)).toEqual([1, 1, 1]);
});

test("every choice holds exactly the desks that were asked for", () => {
  for (const desks of [1, 3, 7, 12, 22, 30, 60]) {
    for (const choice of layoutChoices(desks)) {
      expect(choice.seats.length, `${choice.id} of ${desks}`).toBe(desks);
    }
  }
});

test("no two desks in a choice land on top of each other", () => {
  for (const desks of [4, 13, 27, 31]) {
    for (const choice of layoutChoices(desks)) {
      const spots = new Set(choice.seats.map((spot) => `${spot.x},${spot.y}`));
      expect(spots.size, `${choice.id} of ${desks}`).toBe(desks);
      for (const spot of choice.seats) {
        expect(Math.min(spot.x, spot.y)).toBeGreaterThanOrEqual(0);
      }
    }
  }
});

test("the choices really are wider and deeper than each other", () => {
  for (const desks of [7, 12, 22, 30, 60]) {
    expect(ratio("wide", desks), `wide beats balanced at ${desks}`)
      .toBeGreaterThan(ratio("balanced", desks));
    expect(ratio("balanced", desks), `balanced beats deep at ${desks}`)
      .toBeGreaterThan(ratio("deep", desks));
  }
});

test("no two choices offer the same room", () => {
  for (const desks of [7, 12, 22, 30]) {
    const shapes = layoutChoices(desks).map((choice) =>
      JSON.stringify(choice.seats.map((spot) => [spot.x, spot.y]).sort()));
    expect(new Set(shapes).size, `${desks} desks`).toBe(shapes.length);
  }
});

test("a horseshoe is hollow, and a handful of desks is just a row", () => {
  const u = layoutChoices(24).find((choice) => choice.id === "horseshoe")!;
  const box = choiceBounds(u.seats);
  const middle = u.seats.filter((spot) =>
    spot.x > box.x + SEAT_SIZE && spot.x < box.x + box.width - SEAT_SIZE * 2 &&
    spot.y < box.y + box.height - SEAT_SIZE);
  expect(middle).toEqual([]);
  const arms = u.seats.filter((spot) => spot.y < box.y + box.height - SEAT_SIZE);
  const left = arms.filter((spot) => spot.x === box.x);
  expect(left.length, "the two arms are the same length").toBe(arms.length - left.length);
  const few = layoutChoices(4).find((choice) => choice.id === "horseshoe")!;
  expect(new Set(few.seats.map((spot) => spot.y)).size).toBe(1);
});
