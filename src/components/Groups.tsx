import { useState, type FormEvent } from "react";
import { dataStore } from "../data";
import { useApp } from "../state";
import type { StudentGroup } from "../types";

export function Groups() {
  const { snapshot, setSnapshot } = useApp();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false);
  if (!snapshot) return null;

  const activeStudents = snapshot.students.filter((student) => !student.archived);
  const assignmentByStudent = new Map(snapshot.groupAssignments.map((assignment) => [assignment.studentId, assignment.groupId]));
  const members = (group: StudentGroup) => activeStudents.filter((student) => assignmentByStudent.get(student.id) === group.id);
  const refresh = async () => {
    await dataStore.sync();
    setSnapshot(await dataStore.getSnapshot(snapshot.classRoom.id, true));
  };
  const run = async (action: () => Promise<unknown>) => {
    setMessage("");
    try {
      await action();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That change could not be saved. Please try again.");
    }
  };
  const addGroup = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || adding) return;
    setAdding(true);
    try {
      await dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/groups`, "POST", { label: name.trim() });
      await refresh();
      setName("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The group could not be created. Please try again.");
    } finally {
      setAdding(false);
    }
  };

  return <section className="group-settings">
    <section className="card group-board-intro"><div><p className="eyebrow">WORKING GROUPS</p><h2>Group board</h2><p>Create groups, then learners can choose their own group in the student app.</p></div><strong>{activeStudents.length - snapshot.groupAssignments.filter((assignment) => activeStudents.some((student) => student.id === assignment.studentId)).length} unassigned</strong></section>
    <form className="card group-builder" onSubmit={addGroup}><label>New group name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Table 1" /></label><button className="primary" disabled={!name.trim() || adding}>{adding ? "Adding..." : "Add group"}</button></form>
    {message && <p className="error" role="alert">{message}</p>}
    {snapshot.groups.length ? <div className="teacher-group-board">{snapshot.groups.map((group) => <section className="card teacher-group" key={group.id} style={{ borderTopColor: group.color }}><div className="section-heading"><div><p className="eyebrow">{members(group).length} LEARNERS</p><h3>{group.label}</h3></div><div className="button-row"><button className="text-button" onClick={() => { const label = prompt("Group name", group.label)?.trim(); if (label && label !== group.label) void run(() => dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/groups/${group.id}`, "PATCH", { label })); }}>Rename</button><button className="text-button danger" onClick={() => { if (confirm(`Remove ${group.label}? Learners will become unassigned.`)) void run(() => dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/groups/${group.id}`, "DELETE")); }}>Remove</button></div></div><div className="group-member-list">{members(group).map((student) => <label key={student.id}><span>{student.displayName}</span><select value={group.id} onChange={(event) => { const next = event.target.value; void run(() => next ? dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/groups/${next}/members/${student.id}`, "PUT") : dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/groups/members/${student.id}`, "DELETE")); }}><option value="">Unassigned</option>{snapshot.groups.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>)}{!members(group).length && <p className="empty-note">No learners have selected this group yet.</p>}</div></section>)}</div> : <section className="card empty-report"><h2>Start with a group</h2><p>Add groups such as tables, teams, or stations. Learners will see them in their Groups tab.</p></section>}
    <section className="card unassigned-learners"><div className="section-heading"><h3>Unassigned learners</h3><strong>{activeStudents.filter((student) => !assignmentByStudent.has(student.id)).length}</strong></div>{activeStudents.filter((student) => !assignmentByStudent.has(student.id)).map((student) => <label key={student.id}><span>{student.displayName}</span><select value="" onChange={(event) => { if (event.target.value) void run(() => dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/groups/${event.target.value}/members/${student.id}`, "PUT")); }}><option value="">Assign to group</option>{snapshot.groups.map((group) => <option value={group.id} key={group.id}>{group.label}</option>)}</select></label>)}</section>
  </section>;
}
