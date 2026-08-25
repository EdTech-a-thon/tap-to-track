import { pb } from "$lib/pb";
import { newId, outbox } from "$lib/outbox.svelte";
import { auth } from "$lib/auth.svelte";
import { seatStudent, unseatClass, unseatStudent } from "$lib/domain/assignment";
import { DEFAULT_BEHAVIORS } from "$lib/domain/behaviors";
import { ANCHOR_HEIGHT, ANCHOR_WIDTH } from "$lib/domain/seating";
import { dayKey, resolveTap, tapsSince, today } from "$lib/domain/taps";
import type {
  Anchor, Behavior, BehaviorMode, Class, Seat, Student, Tap,
} from "$lib/domain/types";

const owner = () => auth.teacher?.id ?? "";

const CLEARED_KEY = "tap-to-track-cleared";

/**
 * When each Class's chart was last cleared, remembered on this device. Yesterday's
 * clears are dropped on the way in: the chart already starts clean every morning.
 */
function readCleared(): Record<string, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(CLEARED_KEY) ?? "{}");
    return Object.fromEntries(Object.entries(saved as Record<string, number>)
      .filter(([, when]) => dayKey(new Date(when)) === today()));
  } catch {
    return {};
  }
}

/** Everything the signed-in teacher owns, kept in memory and written straight through. */
class Store {
  classes = $state<Class[]>([]);
  students = $state<Student[]>([]);
  behaviors = $state<Behavior[]>([]);
  seats = $state<Seat[]>([]);
  anchors = $state<Anchor[]>([]);
  taps = $state<Tap[]>([]);
  /** The Tap most recently recorded, so it can be undone from the toast. */
  lastTap = $state<{ id: string; studentName: string; behaviorName: string } | null>(null);
  loaded = $state(false);
  activeClassId = $state<string | null>(null);
  /** Per Class, the moment the teacher last cleared the chart. */
  clearedAt = $state<Record<string, number>>({});

  activeClass = $derived(this.classes.find((cls) => cls.id === this.activeClassId) ?? this.classes[0]);

  studentsIn(classId: string | undefined) {
    return this.students.filter((student) => student.classId === classId);
  }

  /** What one Class's chart and popups count: everything since it was last cleared. */
  chartTaps(classId: string | undefined) {
    return tapsSince(this.taps, (classId && this.clearedAt[classId]) || null);
  }

  /**
   * Starts the Class's chart over — plain desks, counts back to zero, toggles off. The
   * Taps themselves are kept, so nothing disappears from the reports.
   */
  clearChart(classId: string) {
    this.clearedAt = { ...this.clearedAt, [classId]: Date.now() };
    localStorage.setItem(CLEARED_KEY, JSON.stringify(this.clearedAt));
    this.lastTap = null;
  }

  async load() {
    this.clearedAt = readCleared();
    if (!owner()) return;
    outbox.start();
    const [classes, students, behaviors, seats, anchors, taps] = await Promise.all([
      pb.collection("classes").getFullList({ sort: "name" }),
      pb.collection("students").getFullList({ sort: "name" }),
      pb.collection("behaviors").getFullList({ sort: "position" }),
      pb.collection("seats").getFullList(),
      pb.collection("anchors").getFullList(),
      pb.collection("taps").getFullList({ sort: "at" }),
    ]);
    this.classes = classes.map((r) => ({ id: r.id, name: r.name, behaviorIds: r.behaviors ?? [] }));
    this.students = students.map((r) => ({
      id: r.id, classId: r.class, name: r.name, seatId: r.seat || null,
    }));
    this.behaviors = behaviors.map((r) => ({
      id: r.id, name: r.name, color: r.color, mode: r.mode,
      position: r.position ?? 0, away: r.away ?? false,
    }));
    this.seats = seats.map((r) => ({ id: r.id, x: r.x ?? 0, y: r.y ?? 0 }));
    this.anchors = anchors.map((r) => ({
      id: r.id, x: r.x ?? 0, y: r.y ?? 0,
      width: r.width || ANCHOR_WIDTH, height: r.height || ANCHOR_HEIGHT,
      label: r.label ?? "",
    }));
    this.taps = taps.map((r) => ({
      id: r.id, studentId: r.student, behaviorId: r.behavior, createdAt: r.at,
    }));
    if (!this.behaviors.length) await this.seedDefaultBehaviors();
    if (!this.activeClassId) this.activeClassId = this.classes[0]?.id ?? null;
    this.loaded = true;
  }

  /** A teacher who has configured nothing still gets a usable popup. */
  private async seedDefaultBehaviors() {
    const created = await Promise.all(DEFAULT_BEHAVIORS.map((behavior, position) =>
      pb.collection("behaviors").create({ ...behavior, position, owner: owner() })));
    this.behaviors = created.map((r) => ({
      id: r.id, name: r.name, color: r.color, mode: r.mode,
      position: r.position, away: r.away ?? false,
    }));
  }

  async addBehavior(name: string, color: string, mode: BehaviorMode) {
    const position = this.behaviors.length;
    const record = await pb.collection("behaviors").create({ name, color, mode, position, owner: owner() });
    this.behaviors = [...this.behaviors, { id: record.id, name, color, mode, position, away: false }];
  }

  async updateBehavior(id: string, change: Partial<Omit<Behavior, "id">>) {
    await pb.collection("behaviors").update(id, change);
    this.behaviors = this.behaviors.map((b) => (b.id === id ? { ...b, ...change } : b));
  }

  async deleteBehavior(id: string) {
    await pb.collection("behaviors").delete(id);
    this.behaviors = this.behaviors.filter((behavior) => behavior.id !== id);
    this.classes = this.classes.map((cls) => ({
      ...cls, behaviorIds: cls.behaviorIds.filter((behaviorId) => behaviorId !== id),
    }));
  }

  /** Moves a Behavior up or down the list, which is the order the popup uses. */
  async moveBehavior(id: string, direction: -1 | 1) {
    const ordered = [...this.behaviors].sort((a, b) => a.position - b.position);
    const from = ordered.findIndex((behavior) => behavior.id === id);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= ordered.length) return;
    [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
    this.behaviors = ordered.map((behavior, position) => ({ ...behavior, position }));
    await Promise.all(this.behaviors.map((behavior) =>
      pb.collection("behaviors").update(behavior.id, { position: behavior.position })));
  }

  /** Turns a Behavior on or off for one Class. Analytics still counts it either way. */
  async toggleClassBehavior(classId: string, behaviorId: string) {
    const cls = this.classes.find((item) => item.id === classId);
    if (!cls) return;
    const behaviorIds = cls.behaviorIds.includes(behaviorId)
      ? cls.behaviorIds.filter((id) => id !== behaviorId)
      : [...cls.behaviorIds, behaviorId];
    await pb.collection("classes").update(classId, { behaviors: behaviorIds });
    this.classes = this.classes.map((item) => (item.id === classId ? { ...item, behaviorIds } : item));
  }

  async addClass(name: string) {
    const behaviorIds = this.behaviors.map((behavior) => behavior.id);
    const record = await pb.collection("classes").create({ name, owner: owner(), behaviors: behaviorIds });
    this.classes = [...this.classes, { id: record.id, name, behaviorIds }].sort((a, b) =>
      a.name.localeCompare(b.name));
    this.activeClassId ??= record.id;
    return record.id;
  }

  async renameClass(id: string, name: string) {
    await pb.collection("classes").update(id, { name });
    this.classes = this.classes.map((cls) => (cls.id === id ? { ...cls, name } : cls));
  }

  async deleteClass(id: string) {
    await pb.collection("classes").delete(id);
    this.classes = this.classes.filter((cls) => cls.id !== id);
    this.students = this.students.filter((student) => student.classId !== id);
    if (this.activeClassId === id) this.activeClassId = this.classes[0]?.id ?? null;
  }

  async addSeat(x: number, y: number) {
    const record = await pb.collection("seats").create({ x, y, owner: owner() });
    this.seats = [...this.seats, { id: record.id, x, y }];
  }

  /**
   * Builds a whole room at once, which is how a teacher who has just said "thirty desks"
   * gets thirty desks. Only ever used on an empty Layout — see the quick setup.
   */
  async addSeats(spots: { x: number; y: number }[]) {
    const created = await Promise.all(spots.map((spot) =>
      pb.collection("seats").create({ x: spot.x, y: spot.y, owner: owner() })));
    this.seats = [...this.seats, ...created.map((record, index) => ({
      id: record.id, x: spots[index].x, y: spots[index].y,
    }))];
  }

  async moveSeat(id: string, x: number, y: number) {
    this.seats = this.seats.map((seat) => (seat.id === id ? { ...seat, x, y } : seat));
    await pb.collection("seats").update(id, { x, y });
  }

  async deleteSeat(id: string) {
    const occupants = this.students.filter((student) => student.seatId === id);
    await pb.collection("seats").delete(id);
    this.seats = this.seats.filter((seat) => seat.id !== id);
    this.students = this.students.map((student) =>
      student.seatId === id ? { ...student, seatId: null } : student);
    await Promise.all(occupants.map((student) =>
      pb.collection("students").update(student.id, { seat: "" })));
  }

  /** A landmark, not a desk: nobody sits in it, so adding and removing one is unremarkable. */
  async addAnchor(label: string, x: number, y: number) {
    const anchor = { label, x, y, width: ANCHOR_WIDTH, height: ANCHOR_HEIGHT };
    const record = await pb.collection("anchors").create({ ...anchor, owner: owner() });
    this.anchors = [...this.anchors, { id: record.id, ...anchor }];
    return record.id;
  }

  async updateAnchor(id: string, change: Partial<Omit<Anchor, "id">>) {
    this.anchors = this.anchors.map((anchor) =>
      (anchor.id === id ? { ...anchor, ...change } : anchor));
    await pb.collection("anchors").update(id, change);
  }

  async deleteAnchor(id: string) {
    await pb.collection("anchors").delete(id);
    this.anchors = this.anchors.filter((anchor) => anchor.id !== id);
  }

  /**
   * Records one press. Returns what happened so the caller can offer an undo, or explain
   * why nothing was recorded.
   */
  async tap(studentId: string, behavior: Behavior) {
    const classId = this.students.find((student) => student.id === studentId)?.classId;
    const outcome = resolveTap(
      this.chartTaps(classId), today(), studentId, behavior, this.behaviors);
    if (outcome.action === "refuse") return "away" as const;

    if (outcome.action === "remove") {
      await this.removeTap(outcome.tapId);
      return "removed" as const;
    }

    // Optimistic: the count moves now, the write goes through the outbox.
    const id = newId();
    // The app stamps the time itself: a queued Tap belongs to the moment it was pressed,
    // not to whenever the network let it through.
    const at = new Date().toISOString();
    outbox.push({
      kind: "create",
      id,
      data: { student: studentId, behavior: behavior.id, at, owner: owner() },
    });
    this.taps = [...this.taps, { id, studentId, behaviorId: behavior.id, createdAt: at }];
    this.lastTap = {
      id,
      studentName: this.students.find((student) => student.id === studentId)?.name ?? "",
      behaviorName: behavior.name,
    };
    return "added" as const;
  }

  /** Undo hard-deletes the row rather than logging a correction against it. */
  async removeTap(id: string) {
    this.taps = this.taps.filter((tap) => tap.id !== id);
    if (this.lastTap?.id === id) this.lastTap = null;
    if (outbox.cancelCreate(id)) return; // Never sent, so nothing to delete.
    outbox.push({ kind: "delete", id });
  }

  async addStudents(classId: string, names: string[]) {
    const created = await Promise.all(names.map((name) =>
      pb.collection("students").create({ name, class: classId, owner: owner() })));
    this.students = [...this.students, ...created.map((r) => ({
      id: r.id, classId, name: r.name, seatId: null,
    }))];
  }

  /** Seats a Student, swapping with the occupant if there is one. */
  async seatStudent(studentId: string, seatId: string) {
    const before = this.students;
    const after = seatStudent(before, studentId, seatId);
    if (after === before) return;
    this.students = after;
    await this.persistSeats(before, after);
  }

  /** Takes a whole Class out of its desks, leaving the Layout and other Classes alone. */
  async unseatClass(classId: string) {
    const before = this.students;
    const after = unseatClass(before, classId);
    this.students = after;
    await this.persistSeats(before, after);
  }

  async unseatStudent(studentId: string) {
    const before = this.students;
    const after = unseatStudent(before, studentId);
    this.students = after;
    await this.persistSeats(before, after);
  }

  private async persistSeats(before: Student[], after: Student[]) {
    const moved = after.filter((student, index) => student.seatId !== before[index]?.seatId);
    await Promise.all(moved.map((student) =>
      pb.collection("students").update(student.id, { seat: student.seatId ?? "" })));
  }

  async renameStudent(id: string, name: string) {
    await pb.collection("students").update(id, { name });
    this.students = this.students.map((s) => (s.id === id ? { ...s, name } : s));
  }

  async removeStudent(id: string) {
    await pb.collection("students").delete(id);
    this.students = this.students.filter((student) => student.id !== id);
  }
}

export const store = new Store();
