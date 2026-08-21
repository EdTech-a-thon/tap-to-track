export const GRID = 20;

/** Seats snap while dragging, not in storage, so a snapped Layout is ordinary data. */
export function snap(value: number, snapping: boolean, grid = GRID): number {
  if (!snapping) return Math.round(value);
  return Math.round(value / grid) * grid;
}
