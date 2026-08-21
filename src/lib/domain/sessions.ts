import type { Session } from "./types";

/** The Session currently recording, if any. At most one is ever open. */
export function openSessionIn(sessions: Session[]): Session | null {
  return sessions.find((session) => !session.endedAt) ?? null;
}

/**
 * Opens a Session, closing one that was left open. Without that, Monday's lesson
 * silently absorbs Tuesday's taps.
 */
export function startSession(
  sessions: Session[], classId: string, id: string, now: string,
): Session[] {
  const closed = sessions.map((session) =>
    session.endedAt ? session : { ...session, endedAt: now });
  return [...closed, { id, classId, openedAt: now, endedAt: null }];
}

/** Ends a Session. An already-ended Session is left alone — they never reopen. */
export function endSession(sessions: Session[], id: string, now: string): Session[] {
  return sessions.map((session) =>
    session.id === id && !session.endedAt ? { ...session, endedAt: now } : session);
}

/** How long the lesson has been recording, for the banner. */
export function formatElapsed(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
