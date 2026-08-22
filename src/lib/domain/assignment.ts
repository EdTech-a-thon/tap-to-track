import type { Student } from "./types";

/**
 * Seats a Student. If the Seat is taken, the two swap — separating two children who
 * cannot sit together is one action, not three. The displaced Student inherits whatever
 * the moving Student left behind, which may be no Seat at all.
 */
export function seatStudent(students: Student[], studentId: string, seatId: string): Student[] {
  const moving = students.find((student) => student.id === studentId);
  if (!moving || moving.seatId === seatId) return students;
  const occupant = students.find(
    (student) => student.seatId === seatId && student.classId === moving.classId,
  );
  return students.map((student) => {
    if (student.id === moving.id) return { ...student, seatId };
    if (occupant && student.id === occupant.id) return { ...student, seatId: moving.seatId };
    return student;
  });
}

/** Returns a Student to the unseated list without removing them from the Class. */
export function unseatStudent(students: Student[], studentId: string): Student[] {
  return students.map((student) =>
    student.id === studentId ? { ...student, seatId: null } : student);
}

/**
 * What deleting a Seat would cost. The Layout is shared, so one deletion can unseat
 * students in several Classes at once — the teacher is told how many before it happens.
 */
export function seatDeletionImpact(students: Student[], seatId: string): {
  students: Student[];
  classCount: number;
} {
  const affected = students.filter((student) => student.seatId === seatId);
  return {
    students: affected,
    classCount: new Set(affected.map((student) => student.classId)).size,
  };
}

/** Everyone in the Class with no Seat — still tappable, still counted. */
export function unseatedIn(students: Student[], classId: string): Student[] {
  return students.filter((student) => student.classId === classId && !student.seatId);
}
