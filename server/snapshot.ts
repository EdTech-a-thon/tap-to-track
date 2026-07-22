import type { AppDatabase } from "./db.js";
import { json } from "./support.js";
import { classSettings } from "../src/classSettings.js";

type Row = Record<string, unknown>;

function classRoom(row: Row) {
  return {
    id: row.id, name: row.name, activeLens: row.activeLens, joinCode: row.joinCode,
    settings: classSettings(json(String(row.settings))), createdAt: row.createdAt,
  };
}

function student(row: Row) {
  return {
    id: row.id, classId: row.classId, displayName: row.displayName, avatar: json(String(row.avatar)),
    tags: json(String(row.tags)), archived: Boolean(row.archived), enrolledAt: row.enrolledAt,
    archivedAt: row.archivedAt ?? null, x: row.x, y: row.y,
  };
}

export function getClassSnapshot(db: AppDatabase, teacherId: string, classId: string) {
  const room = db.prepare("SELECT * FROM classes WHERE id = ? AND teacherId = ?").get(classId, teacherId) as Row | undefined;
  if (!room) return null;
  const students = (db.prepare("SELECT * FROM students WHERE classId = ? AND teacherId = ? ORDER BY displayName").all(classId, teacherId) as Row[]).map(student);
  const skills = (db.prepare("SELECT * FROM skills WHERE classId = ? AND teacherId = ? ORDER BY sortOrder").all(classId, teacherId) as Row[]).map((row) => ({
    id: row.id, classId: row.classId, label: row.label, category: row.category, order: row.sortOrder, visibleToStudents: Boolean(row.visibleToStudents), parentSkillId: row.parentSkillId ?? null,
  }));
  const mastery = (db.prepare("SELECT studentId, skillId, achievement, requiresSupport, updatedAt FROM mastery WHERE classId = ? AND teacherId = ?").all(classId, teacherId) as Row[]).map((row) => ({ ...row, requiresSupport: Boolean(row.requiresSupport) }));
  const masteryEvents = db.prepare("SELECT id, studentId, skillId, previousAchievement, achievement, previousRequiresSupport, requiresSupport, timestamp, periodId, skillLabel, category FROM mastery_events WHERE classId = ? AND teacherId = ? ORDER BY timestamp, rowid").all(classId, teacherId) as Row[];
  const periods = (db.prepare("SELECT id, classId, label, startedAt, endedAt, status, active, scheduled, attendanceCompletedAt, reopenedAt, type, participationExpected, teacherNote FROM periods WHERE classId = ? AND teacherId = ? ORDER BY startedAt DESC").all(classId, teacherId) as Row[]).map((row) => ({ ...row, active: Boolean(row.active), scheduled: Boolean(row.scheduled), participationExpected: Boolean(row.participationExpected) }));
  const attendance = db.prepare("SELECT periodId, studentId, status FROM attendance WHERE classId = ? AND teacherId = ?").all(classId, teacherId);
  const events = db.prepare("SELECT id, classId, studentId, periodId, type, requestTypeId, timestamp FROM events WHERE classId = ? AND teacherId = ? ORDER BY timestamp").all(classId, teacherId);
  const requestTypes = (db.prepare("SELECT id, classId, label, color, behavior, resolveLabel FROM request_types WHERE classId = ? AND teacherId = ?").all(classId, teacherId) as Row[]);
  const timestamp = new Date().toISOString();
  const requests = (db.prepare(`SELECT r.id, r.studentId, r.requestTypeId, r.status, r.joinedAt, r.acknowledgedAt,
    r.resolvedAt, r.cancelledAt, r.resolvedBy, r.updatedAt, t.behavior
    FROM requests r JOIN request_types t ON t.id = r.requestTypeId AND t.classId = r.classId AND t.teacherId = r.teacherId
    WHERE r.classId = ? AND r.teacherId = ? AND r.status IN ('active', 'acknowledged') ORDER BY r.joinedAt, r.rowid`).all(classId, teacherId) as Row[])
    .map((request) => ({ ...request, wait: Math.max(0, Date.parse(timestamp) - Date.parse(String(request.joinedAt))) }));
  const requestHistory = db.prepare(`SELECT id, studentId, requestTypeId, status, joinedAt, acknowledgedAt,
    resolvedAt, cancelledAt, resolvedBy, updatedAt FROM requests
    WHERE classId = ? AND teacherId = ? ORDER BY joinedAt, rowid`).all(classId, teacherId);
  const tags = db.prepare("SELECT id, classId, label FROM tags WHERE classId = ? AND teacherId = ?").all(classId, teacherId);
  const skillRows = skills as unknown as Row[]; const masteryRows = mastery as Row[]; const parentSkills = skillRows.filter((skill) => !skill.parentSkillId);
  const childrenByParent = new Map<string, Row[]>();
  for (const skill of skillRows) if (skill.parentSkillId) {
    const key = String(skill.parentSkillId);
    childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), skill]);
  }
  const masteryByStudentSkill = new Map(masteryRows.map((row) => [`${String(row.studentId)}\u0000${String(row.skillId)}`, row]));
  const participationByStudent = new Map<string, number>();
  for (const event of events as Row[]) {
    const amount = event.type === "part+" ? 1 : event.type === "part-" ? -1 : 0;
    if (amount) participationByStudent.set(String(event.studentId), (participationByStudent.get(String(event.studentId)) ?? 0) + amount);
  }
  const absencesByStudent = new Map<string, number>();
  for (const entry of attendance as Row[]) if (entry.status === "absent") absencesByStudent.set(String(entry.studentId), (absencesByStudent.get(String(entry.studentId)) ?? 0) + 1);
  const summarize = (studentId: unknown, parentId: unknown) => {
    const rows = (childrenByParent.get(String(parentId)) ?? []).map((skill) => masteryByStudentSkill.get(`${String(studentId)}\u0000${String(skill.id)}`));
    return { total: rows.length, evidenceCount: rows.filter((row) => row?.achievement !== undefined && row.achievement !== "not_started").length, meetOrExceedCount: rows.filter((row) => row?.achievement === "meets" || row?.achievement === "exceeds").length, requiresSupportCount: rows.filter((row) => Boolean(row?.requiresSupport)).length, notStartedCount: rows.filter((row) => !row || row.achievement === "not_started").length };
  };
  const summaries = students.map((item) => ({
    studentId: item.id,
    participation: participationByStudent.get(String(item.id)) ?? 0,
    absences: absencesByStudent.get(String(item.id)) ?? 0,
    parentSummaries: Object.fromEntries(parentSkills.map((skill) => [String(skill.id), summarize(item.id, skill.id)])),
    skillsTotal: parentSkills.length,
  }));
  return { classRoom: classRoom(room), students, skills, mastery, masteryEvents: masteryEvents.map((event) => ({ ...event, previousRequiresSupport: Boolean(event.previousRequiresSupport), requiresSupport: Boolean(event.requiresSupport) })), periods, attendance, events, requestTypes, requests, requestHistory, tags, rosterImports: [], summaries };
}

export function getTeacherClasses(db: AppDatabase, teacherId: string) {
  return (db.prepare("SELECT * FROM classes WHERE teacherId = ? ORDER BY createdAt DESC").all(teacherId) as Row[]).map(classRoom);
}
