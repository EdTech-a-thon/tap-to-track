export type SeatPoint = { x: number; y: number };

export type SeatBounds = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

export type SeatTransform = {
  scale: number;
  translateX: number;
  translateY: number;
};

export const SEAT_CARD_WIDTH = 180;
export const SEAT_CARD_HEIGHT = 196;
export const SEAT_GAP = 24;
export const SEAT_PADDING = 28;

export function defaultSeatPositions(
  count: number,
  viewportWidth = 1180,
  viewportHeight = 680,
): SeatPoint[] {
  if (count <= 0) return [];
  let columns = 1;
  let bestScale = 0;
  for (let candidate = 1; candidate <= count; candidate += 1) {
    const rows = Math.ceil(count / candidate);
    const width = candidate * SEAT_CARD_WIDTH + (candidate - 1) * SEAT_GAP;
    const height = rows * SEAT_CARD_HEIGHT + (rows - 1) * SEAT_GAP;
    const scale = Math.min(viewportWidth / width, viewportHeight / height);
    if (scale > bestScale) {
      bestScale = scale;
      columns = candidate;
    }
  }
  return Array.from({ length: count }, (_, index) => ({
    x: SEAT_PADDING + (index % columns) * (SEAT_CARD_WIDTH + SEAT_GAP),
    y: SEAT_PADDING + Math.floor(index / columns) * (SEAT_CARD_HEIGHT + SEAT_GAP),
  }));
}

export function seatBounds(
  positions: SeatPoint[],
  cardWidth = SEAT_CARD_WIDTH,
  cardHeight = SEAT_CARD_HEIGHT,
  padding = SEAT_PADDING,
): SeatBounds {
  if (!positions.length) return { minX: 0, minY: 0, width: 0, height: 0 };
  const minX = Math.min(...positions.map((position) => position.x - padding));
  const minY = Math.min(...positions.map((position) => position.y - padding));
  const maxX = Math.max(...positions.map((position) => position.x + cardWidth + padding));
  const maxY = Math.max(...positions.map((position) => position.y + cardHeight + padding));
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

export function fitSeats(
  bounds: SeatBounds,
  viewportWidth: number,
  viewportHeight: number,
  padding = 16,
): SeatTransform {
  if (!bounds.width || !bounds.height || !viewportWidth || !viewportHeight) {
    return { scale: 1, translateX: padding, translateY: padding };
  }
  const scale = Math.min(
    1,
    Math.max(0.01, (viewportWidth - padding * 2) / bounds.width),
    Math.max(0.01, (viewportHeight - padding * 2) / bounds.height),
  );
  return {
    scale,
    translateX: (viewportWidth - bounds.width * scale) / 2 - bounds.minX * scale,
    translateY: (viewportHeight - bounds.height * scale) / 2 - bounds.minY * scale,
  };
}

export function centerSeats(
  bounds: SeatBounds,
  viewportWidth: number,
  viewportHeight: number,
  scale: number,
): SeatTransform {
  return {
    scale,
    translateX: (viewportWidth - bounds.width * scale) / 2 - bounds.minX * scale,
    translateY: (viewportHeight - bounds.height * scale) / 2 - bounds.minY * scale,
  };
}

export function logicalRoomForZoom(
  viewportWidth: number,
  viewportHeight: number,
  scale: number,
): SeatBounds {
  if (!viewportWidth || !viewportHeight || !scale) return { minX: 0, minY: 0, width: 0, height: 0 };
  return {
    minX: 0,
    minY: 0,
    width: viewportWidth / scale,
    height: viewportHeight / scale,
  };
}

export function unionSeatBounds(first: SeatBounds, second: SeatBounds): SeatBounds {
  if (!first.width || !first.height) return second;
  if (!second.width || !second.height) return first;
  const minX = Math.min(first.minX, second.minX);
  const minY = Math.min(first.minY, second.minY);
  const maxX = Math.max(first.minX + first.width, second.minX + second.width);
  const maxY = Math.max(first.minY + first.height, second.minY + second.height);
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

export function screenToSeat(
  clientX: number,
  clientY: number,
  viewportLeft: number,
  viewportTop: number,
  transform: SeatTransform,
): SeatPoint {
  return {
    x: (clientX - viewportLeft - transform.translateX) / transform.scale,
    y: (clientY - viewportTop - transform.translateY) / transform.scale,
  };
}

export function clampSeat(point: SeatPoint, bounds: SeatBounds): SeatPoint {
  // Seats use room coordinates, so dragging must never save them above or left of the room.
  const minX = Math.max(SEAT_PADDING, bounds.minX + SEAT_PADDING);
  const minY = Math.max(SEAT_PADDING, bounds.minY + SEAT_PADDING);
  return {
    x: Math.max(minX, Math.min(Math.max(minX, bounds.minX + bounds.width - SEAT_PADDING - SEAT_CARD_WIDTH), point.x)),
    y: Math.max(minY, Math.min(Math.max(minY, bounds.minY + bounds.height - SEAT_PADDING - SEAT_CARD_HEIGHT), point.y)),
  };
}
