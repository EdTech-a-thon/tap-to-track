import { describe, expect, it } from "vitest";
import {
  centerSeats,
  clampSeat,
  defaultSeatPositions,
  fitSeats,
  logicalRoomForZoom,
  screenToSeat,
  seatBounds,
  unionSeatBounds,
  SEAT_CARD_HEIGHT,
  SEAT_CARD_WIDTH,
} from "../src/seating";

describe("seating geometry", () => {
  it.each([1, 35, 40, 100])("fits every card in the viewport for %i learners", (count) => {
    const bounds = seatBounds(defaultSeatPositions(count));
    const viewport = { width: 1180, height: 680 };
    const fit = fitSeats(bounds, viewport.width, viewport.height);

    expect(fit.scale).toBeGreaterThan(0);
    expect(bounds.width * fit.scale).toBeLessThanOrEqual(viewport.width - 32 + 0.001);
    expect(bounds.height * fit.scale).toBeLessThanOrEqual(viewport.height - 32 + 0.001);
    expect(defaultSeatPositions(count)).toHaveLength(count);
  });

  it("includes the complete card dimensions in room bounds", () => {
    const bounds = seatBounds([{ x: 100, y: 200 }]);
    expect(bounds).toEqual({
      minX: 72,
      minY: 172,
      width: SEAT_CARD_WIDTH + 56,
      height: SEAT_CARD_HEIGHT + 56,
    });
  });

  it("centers seats stored at negative coordinates", () => {
    const bounds = seatBounds([{ x: -50, y: -40 }, { x: 200, y: 180 }]);
    const transform = fitSeats(bounds, 800, 600);

    expect(transform.translateX + bounds.minX * transform.scale).toBeCloseTo((800 - bounds.width * transform.scale) / 2);
    expect(transform.translateY + bounds.minY * transform.scale).toBeCloseTo((600 - bounds.height * transform.scale) / 2);
  });

  it("converts transformed screen coordinates back to room coordinates", () => {
    const transform = { scale: 0.5, translateX: 45, translateY: 49 };
    expect(screenToSeat(410, 270, 110, 70, transform)).toEqual({ x: 510, y: 302 });
  });

  it("centers manual zoom and clamps a transformed drag to the room", () => {
    const bounds = seatBounds(defaultSeatPositions(35, 1024, 500));
    const transform = centerSeats(bounds, 1024, 500, 0.7);
    const viewport = { left: 12, top: 180 };
    const logical = screenToSeat(
      viewport.left + transform.translateX - 100,
      viewport.top + transform.translateY - 100,
      viewport.left,
      viewport.top,
      transform,
    );
    expect(clampSeat(logical, bounds)).toEqual({ x: bounds.minX + 28, y: bounds.minY + 28 });
  });

  it.each([
    [1, { width: 1100, height: 500 }],
    [0.75, { width: 1466.6666666666667, height: 666.6666666666666 }],
    [0.5, { width: 2200, height: 1000 }],
  ])("creates the viewport-sized logical room at %p zoom", (scale, dimensions) => {
    expect(logicalRoomForZoom(1100, 500, scale)).toEqual({ minX: 0, minY: 0, ...dimensions });
  });

  it("allows a zoomed-out drag beyond saved seats without retaining expanded bounds", () => {
    const saved = seatBounds([{ x: 100, y: 100 }]);
    const atFifty = unionSeatBounds(logicalRoomForZoom(1100, 500, 0.5), saved);
    expect(clampSeat({ x: 1800, y: 700 }, atFifty)).toEqual({ x: 1800, y: 700 });
    expect(unionSeatBounds(logicalRoomForZoom(1100, 500, 1), saved)).toEqual({ minX: 0, minY: 0, width: 1100, height: 500 });
  });

  it("keeps saved seats when zooming back in", () => {
    const saved = seatBounds([{ x: 1800, y: 700 }]);
    const room = unionSeatBounds(logicalRoomForZoom(1100, 500, 1), saved);
    expect(room.width).toBeGreaterThanOrEqual(2008);
    expect(room.height).toBeGreaterThanOrEqual(900);
  });
});
