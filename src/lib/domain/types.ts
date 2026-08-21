// The vocabulary here is the project glossary in CONTEXT.md. Read it before renaming
// anything: "Class" is a roster that meets repeatedly, "Session" is one meeting of it.

export type BehaviorMode = "tally" | "toggle";

/** One thing a teacher tracks by tapping. Global to the teacher, capped at six. */
export type Behavior = {
  id: string;
  name: string;
  color: string;
  /** Tallies count every tap; toggles are on or off for the whole Session. */
  mode: BehaviorMode;
  position: number;
  /** While this Behavior is on, the Student is out of the room and cannot be recorded
   * for anything else. Only sensible on a toggling Behavior. */
  away?: boolean;
};

/** One position in the Layout. Shared by every Class — see ADR 0002. */
export type Seat = { id: string; x: number; y: number };

/** A roster that meets repeatedly. */
export type Class = {
  id: string;
  name: string;
  /** Which Behaviors appear on this Class's popup. Analytics counts all of them anyway. */
  behaviorIds: string[];
};

/** A learner on one Class roster. One Student, one Class — see ADR 0003. */
export type Student = {
  id: string;
  classId: string;
  /** First name plus up to three letters of a surname. Never a full surname. */
  name: string;
  /** null means Unseated: still tappable, still counted. */
  seatId: string | null;
};

/** One meeting of a Class. */
export type Session = {
  id: string;
  classId: string;
  openedAt: string;
  /** null while the Session is open. An ended Session never reopens. */
  endedAt: string | null;
};

/** One recorded event. Append-only except for Undo and un-toggling. */
export type Tap = {
  id: string;
  sessionId: string;
  studentId: string;
  behaviorId: string;
  createdAt: string;
};
