import { pb } from "$lib/pb";
import { auth } from "$lib/auth.svelte";
import type { Behavior, Class, Seat, Student } from "$lib/domain/types";

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
    if (!this.activeClassId) this.activeClassId = this.classes[0]?.id ?? null;
    this.loaded = true;
  }

  async addClass(name: string) {
    const record = await pb.collection("classes").create({ name, owner: owner(), behaviors: [] });
    this.classes = [...this.classes, { id: record.id, name, behaviorIds: [] }].sort((a, b) =>
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
