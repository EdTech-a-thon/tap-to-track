import { pb } from "$lib/pb";
import { auth } from "$lib/auth.svelte";
import { DEFAULT_BEHAVIORS } from "$lib/domain/behaviors";
import type { Behavior, BehaviorMode, Class, Seat, Student } from "$lib/domain/types";

const owner = () => auth.teacher?.id ?? "";

/** Everything the signed-in teacher owns, kept in memory and written straight through. */
class Store {
  classes = $state<Class[]>([]);
  students = $state<Student[]>([]);
  behaviors = $state<Behavior[]>([]);
  seats = $state<Seat[]>([]);
  loaded = $state(false);
  activeClassId = $state<string | null>(null);

  activeClass = $derived(this.classes.find((cls) => cls.id === this.activeClassId) ?? this.classes[0]);

  studentsIn(classId: string | undefined) {
    return this.students.filter((student) => student.classId === classId);
  }

  async load() {
    if (!owner()) return;
    const [classes, students, behaviors, seats] = await Promise.all([
      pb.collection("classes").getFullList({ sort: "name" }),
      pb.collection("students").getFullList({ sort: "name" }),
      pb.collection("behaviors").getFullList({ sort: "position" }),
      pb.collection("seats").getFullList(),
    ]);
    this.classes = classes.map((r) => ({ id: r.id, name: r.name, behaviorIds: r.behaviors ?? [] }));
    this.students = students.map((r) => ({
      id: r.id, classId: r.class, name: r.name, seatId: r.seat || null,
    }));
    this.behaviors = behaviors.map((r) => ({
      id: r.id, name: r.name, color: r.color, mode: r.mode, position: r.position ?? 0,
    }));
    this.seats = seats.map((r) => ({ id: r.id, x: r.x ?? 0, y: r.y ?? 0 }));
    if (!this.behaviors.length) await this.seedDefaultBehaviors();
    if (!this.activeClassId) this.activeClassId = this.classes[0]?.id ?? null;
    this.loaded = true;
  }

  /** A teacher who has configured nothing still gets a usable popup. */
  private async seedDefaultBehaviors() {
    const created = await Promise.all(DEFAULT_BEHAVIORS.map((behavior, position) =>
      pb.collection("behaviors").create({ ...behavior, position, owner: owner() })));
    this.behaviors = created.map((r) => ({
      id: r.id, name: r.name, color: r.color, mode: r.mode, position: r.position,
    }));
  }

  async addBehavior(name: string, color: string, mode: BehaviorMode) {
    const position = this.behaviors.length;
    const record = await pb.collection("behaviors").create({ name, color, mode, position, owner: owner() });
    this.behaviors = [...this.behaviors, { id: record.id, name, color, mode, position }];
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

  async moveSeat(id: string, x: number, y: number) {
    this.seats = this.seats.map((seat) => (seat.id === id ? { ...seat, x, y } : seat));
    await pb.collection("seats").update(id, { x, y });
  }

  async deleteSeat(id: string) {
    await pb.collection("seats").delete(id);
    this.seats = this.seats.filter((seat) => seat.id !== id);
  }

  async addStudents(classId: string, names: string[]) {
    const created = await Promise.all(names.map((name) =>
      pb.collection("students").create({ name, class: classId, owner: owner() })));
    this.students = [...this.students, ...created.map((r) => ({
      id: r.id, classId, name: r.name, seatId: null,
    }))];
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
