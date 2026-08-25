import { expect, test } from "vitest";
import {
  clashingIndexes,
  findCollisions,
  parseCsvRoster,
  parsePastedRoster,
  toDisplayName,
} from "./roster";

test("a display name keeps the first name and only the letters of the surname asked for", () => {
  expect(toDisplayName("Maya Chen")).toBe("Maya C");
  expect(toDisplayName("Maya Chen", 2)).toBe("Maya Ch");
  expect(toDisplayName("Maya")).toBe("Maya");
});

test("no more than three letters of a surname are ever kept", () => {
  expect(toDisplayName("Maya Chen", 9)).toBe("Maya Che");
});

test("pasted names split on newlines, commas, or a mixture", () => {
  expect(parsePastedRoster("Avery\nJordan, Kai\n\n  Riley  ")).toEqual([
    "Avery",
    "Jordan",
    "Kai",
    "Riley",
  ]);
});

test("a CSV uses its name column, whichever position it is in", () => {
  const csv = "id,Student Name,grade\n7,Maya Chen,9\n8,Sam Ali,9";
  expect(parseCsvRoster(csv)).toEqual(["Maya C", "Sam A"]);
});

test("a CSV with no header falls back to the first column", () => {
  expect(parseCsvRoster("Avery Smith\nJordan Blake")).toEqual([
    "Avery S",
    "Jordan B",
  ]);
});

test("a surname-first cell is flipped back to first-name-first", () => {
  const csv = 'name\n"Chen, Maya"\n"Ali, Sam"';
  expect(parseCsvRoster(csv)).toEqual(["Maya C", "Sam A"]);
});

test("two students who would read identically are reported, not silently merged", () => {
  const collisions = findCollisions(["Maya C", "Sam A", "Maya C"]);
  expect(collisions).toEqual([{ name: "Maya C", indexes: [0, 2] }]);
});

test("names differing only in case still collide, because a teacher reads them the same", () => {
  expect(findCollisions(["Maya C", "maya c"])).toHaveLength(1);
});

test("a roster with no repeats reports nothing", () => {
  expect(findCollisions(["Maya Ce", "Maya Ch"])).toEqual([]);
});

test("an incoming name clashing with someone already on the roster is flagged", () => {
  expect(clashingIndexes(["Maya C"], ["Sam A", "Maya C"])).toEqual([1]);
});

test("incoming names clashing only with each other are both flagged", () => {
  expect(clashingIndexes([], ["Maya C", "Maya C"])).toEqual([0, 1]);
});

test("an import that clashes with nobody is clean", () => {
  expect(clashingIndexes(["Maya Ce"], ["Maya Ch"])).toEqual([]);
});
