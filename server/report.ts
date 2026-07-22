import type { AppDatabase } from "./db.js";
import { json } from "./support.js";
import { achievementLevels } from "./mastery.js";
import { classSettings } from "../src/classSettings.js";

type Row = Record<string, unknown>;
export type ReportQuery = Record<string, string | undefined>;

function selectedByRange(periods: Row[], query: ReportQuery): Row[] {
  const range = query.range ?? "all";
  if (!(["last5", "last10", "week", "all", "custom"] as string[]).includes(range)) throw new Error("Range is invalid");
  if (range === "last5" || range === "last10") return periods.slice(0, range === "last5" ? 5 : 10);
  const from = range === "week" ? new Date(Date.now() - 7 * 86400000).toISOString() : query.from;
  const to = query.to;
  if (range === "custom" && (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)))) throw new Error("Custom range requires valid from and to dates");
  return periods.filter((period) => (!from || String(period.startedAt) >= from) && (!to || String(period.startedAt) <= to));
}

export function buildClassReport(db: AppDatabase, teacherId: string, classId: string, query: ReportQuery) {
  const room = db.prepare("SELECT id, name, settings FROM classes WHERE id = ? AND teacherId = ?").get(classId, teacherId) as Row | undefined;
  if (!room) return null;
  const settings = classSettings(json(String(room.settings)));
  let periods = db.prepare("SELECT id, label, startedAt, endedAt, status, active, scheduled, attendanceCompletedAt, reopenedAt, type, participationExpected, teacherNote FROM periods WHERE classId = ? AND teacherId = ? AND status != 'scheduled' ORDER BY startedAt DESC").all(classId, teacherId) as Row[];
  periods = selectedByRange(periods, query);
  const asOf = reportEnd(periods, query);
  const rangeStart = reportStart(periods, query);
  const periodIds = new Set(periods.map((period) => period.id));
  const allStudents = db.prepare("SELECT id, displayName, tags, enrolledAt, archived, archivedAt FROM students WHERE classId = ? AND teacherId = ? ORDER BY displayName").all(classId, teacherId) as Row[];
  const attendance = (db.prepare("SELECT periodId, studentId, status FROM attendance WHERE classId = ? AND teacherId = ?").all(classId, teacherId) as Row[]).filter((item) => periodIds.has(item.periodId));
  const events = (db.prepare("SELECT periodId, studentId, type, timestamp FROM events WHERE classId = ? AND teacherId = ? ORDER BY timestamp").all(classId, teacherId) as Row[]).filter((item) => periodIds.has(item.periodId));
  const skills = db.prepare("SELECT id, label, category, parentSkillId, sortOrder FROM skills WHERE classId = ? AND teacherId = ? ORDER BY sortOrder").all(classId, teacherId) as Row[];
  const currentMastery = db.prepare("SELECT studentId, skillId, achievement, requiresSupport, updatedAt FROM mastery WHERE classId = ? AND teacherId = ?").all(classId, teacherId) as Row[];
  const allMasteryEvents = db.prepare("SELECT id, studentId, skillId, previousAchievement, achievement, previousRequiresSupport, requiresSupport, timestamp, periodId, skillLabel, category FROM mastery_events WHERE classId = ? AND teacherId = ? ORDER BY timestamp, rowid").all(classId, teacherId) as Row[];
  const photos = db.prepare("SELECT id, studentId, skillId, periodId, assessedAt, mimeType, originalFilename, createdAt FROM skill_evidence_photos WHERE classId = ? AND teacherId = ? ORDER BY assessedAt, createdAt").all(classId, teacherId) as Row[];
  let requestHistory = (db.prepare(`SELECT r.id, r.studentId, r.requestTypeId, t.label requestTypeLabel, t.behavior,
    r.status, r.joinedAt, r.acknowledgedAt, r.resolvedAt, r.cancelledAt, r.updatedAt
    FROM requests r JOIN request_types t ON t.id = r.requestTypeId
    WHERE r.classId = ? AND r.teacherId = ? ORDER BY r.joinedAt, r.rowid`).all(classId, teacherId) as Row[])
    .filter((request) => String(request.joinedAt) >= rangeStart && String(request.joinedAt) <= asOf);
  const hasEvents = allMasteryEvents.length > 0;
  const historicalEvents = allMasteryEvents.filter((event) => String(event.timestamp) <= asOf);
  const reconstructed = latestMastery(historicalEvents);
  const reconstructedKeys = new Set(reconstructed.map((item) => `${String(item.studentId)}\u0000${String(item.skillId)}`));
  const noHistoryCurrent = currentMastery.filter((item) => !allMasteryEvents.some((event) => event.studentId === item.studentId && event.skillId === item.skillId));
  const currentThroughAsOf = noHistoryCurrent.filter((item) => String(item.updatedAt) <= asOf);
  const mastery = hasEvents
    ? [...reconstructed, ...currentThroughAsOf.filter((item) => !reconstructedKeys.has(`${String(item.studentId)}\u0000${String(item.skillId)}`))]
    : currentMastery.filter((item) => String(item.updatedAt) <= asOf);
  const evidence: Row[] = allMasteryEvents.filter((event) => String(event.timestamp) >= rangeStart && String(event.timestamp) <= asOf);
  const minAttended = query.minAttended === undefined ? 0 : Number(query.minAttended);
  if (!Number.isInteger(minAttended) || minAttended < 0) throw new Error("minAttended must be a non-negative integer");
  const attendanceByPeriodStudent = new Map(attendance.map((item) => [`${String(item.periodId)}\u0000${String(item.studentId)}`, item.status]));
  const eventsByStudent = new Map<string, Row[]>();
  for (const event of events) eventsByStudent.set(String(event.studentId), [...(eventsByStudent.get(String(event.studentId)) ?? []), event]);
  const photosByStudent = new Map<string, number>();
  for (const photo of photos) if (String(photo.assessedAt) >= rangeStart && String(photo.assessedAt) <= asOf) photosByStudent.set(String(photo.studentId), (photosByStudent.get(String(photo.studentId)) ?? 0) + 1);
  const parentIds = new Set(skills.map((skill) => String(skill.parentSkillId ?? "")).filter(Boolean));
  const leaves = skills.filter((skill) => !parentIds.has(String(skill.id)));
  const masteryByStudentSkill = new Map(mastery.map((item) => [`${String(item.studentId)}\u0000${String(item.skillId)}`, item]));
  const summarize = (studentId: unknown, children: Row[]) => {
    const rows = children.map((skill) => masteryByStudentSkill.get(`${String(studentId)}\u0000${String(skill.id)}`));
    return { total: rows.length, evidenceCount: rows.filter((row) => row && row.achievement !== "not_started").length, meetOrExceedCount: rows.filter((row) => row?.achievement === "meets" || row?.achievement === "exceeds").length, requiresSupportCount: rows.filter((row) => Boolean(row?.requiresSupport)).length, notStartedCount: rows.filter((row) => !row || row.achievement === "not_started").length };
  };

  const students = allStudents.map((student) => {
    const tags = json<string[]>(String(student.tags));
    const enrolledPeriods = periods.filter((period) => String(period.endedAt ?? new Date().toISOString()) >= String(student.enrolledAt) && (!student.archivedAt || String(period.startedAt) <= String(student.archivedAt)));
    const instruction = enrolledPeriods.filter((period) => period.type === "instructional" && Boolean(period.participationExpected));
    const present = (period: Row) => attendanceByPeriodStudent.get(`${String(period.id)}\u0000${String(student.id)}`) !== "absent";
    const attended = instruction.filter(present);
    const attendedClassDays = enrolledPeriods.filter(present).length;
    const participationPeriods = enrolledPeriods.filter((period) => Boolean(period.participationExpected) && present(period));
    const participationPeriodIds = new Set(participationPeriods.map((period) => period.id));
    const ownEvents = (eventsByStudent.get(String(student.id)) ?? []).filter((event) => participationPeriodIds.has(event.periodId));
    const participatedPeriods = new Set(ownEvents.filter((event) => event.type === "part+").map((event) => event.periodId)).size;
    const positives = ownEvents.filter((event) => event.type === "part+").length;
    const redirects = ownEvents.filter((event) => event.type === "part-").length;
    const lastPositiveIndex = participationPeriods.findIndex((period) => ownEvents.some((event) => event.periodId === period.id && event.type === "part+"));
    const summary = summarize(student.id, leaves);
    const absences = enrolledPeriods.length - attendedClassDays;
    return {
      studentId: student.id, displayName: student.displayName, tags, enrolledAt: student.enrolledAt,
      archived: Boolean(student.archived), archivedAt: student.archivedAt ?? null,
      enrolledPeriods: enrolledPeriods.length, attendedClassDays, attendedInstructionalExpectedPeriods: attended.length,
      participationEligiblePeriods: participationPeriods.length, participatedPeriods,
      periodsSincePositive: lastPositiveIndex < 0 ? null : lastPositiveIndex,
      lastActionAt: ownEvents.length ? String(ownEvents[ownEvents.length - 1].timestamp) : null,
      positives, redirects,
      absences, achievementSummary: summary,
      photoEvidenceCount: photosByStudent.get(String(student.id)) ?? 0,
    };
  }).filter((student) => {
    const search = query.search?.trim().toLocaleLowerCase();
    return (!query.tag || student.tags.includes(query.tag))
      && (!search || String(student.displayName).toLocaleLowerCase().includes(search))
      && student.attendedInstructionalExpectedPeriods >= minAttended;
  });

  const skillDetails = skills.map((skill) => {
    const isParent = parentIds.has(String(skill.id));
    const achievements = isParent ? undefined : students.map((student) => { const row = masteryByStudentSkill.get(`${String(student.studentId)}\u0000${String(skill.id)}`); return { studentId: student.studentId, achievement: achievementLevels.includes(row?.achievement as typeof achievementLevels[number]) ? row?.achievement : "not_started", requiresSupport: Boolean(row?.requiresSupport) }; });
    const children = isParent ? skills.filter((item) => item.parentSkillId === skill.id) : [];
    const summaries = isParent ? students.map((student) => ({ studentId: student.studentId, summary: summarize(student.studentId, children) })) : undefined;
    const changes = evidence.filter((event) => event.skillId === skill.id);
    return {
      id: skill.id, label: skill.label, category: skill.category, parentSkillId: skill.parentSkillId ?? null,
      isParent, achievements, summaries,
      distribution: isParent ? undefined : Object.fromEntries(achievementLevels.map((level) => [level, achievements!.filter((item) => item.achievement === level).length])),
      supportCount: isParent ? undefined : achievements!.filter((item) => item.requiresSupport).length,
      trends: isParent ? undefined : { ...Object.fromEntries(achievementLevels.map((level) => [level, changes.filter((event) => event.achievement === level).length])), requiresSupport: changes.filter((event) => event.requiresSupport).length },
    };
  });
  const tags = [...new Set(students.flatMap((student) => student.tags))];
  const equity = tags.map((tag) => { const group = students.filter((student) => student.tags.includes(tag)); return { tag, students: group.length, positives: group.reduce((sum, item) => sum + item.positives, 0), redirects: group.reduce((sum, item) => sum + item.redirects, 0) }; });
  const filteredStudentIds = new Set(students.map((student) => student.studentId));
  const photoEvidence = photos.filter((photo) => filteredStudentIds.has(photo.studentId) && String(photo.assessedAt) >= rangeStart && String(photo.assessedAt) <= asOf);
  const filteredEvidence = evidence.filter((event) => filteredStudentIds.has(event.studentId));
  requestHistory = requestHistory.filter((request) => filteredStudentIds.has(request.studentId));
  return {
    classRoom: { id: room.id, name: room.name, settings },
    filters: { range: query.range ?? "all", from: query.from ?? null, to: query.to ?? null, tag: query.tag ?? null, search: query.search ?? null, minAttended },
    periods: periods.map((period) => ({ ...period, id: String(period.id), label: String(period.label), active: Boolean(period.active), participationExpected: Boolean(period.participationExpected) })),
    asOf, historicalMasteryReconstructable: hasEvents && noHistoryCurrent.length === 0, photoEvidenceCount: photoEvidence.length, photoEvidence, students: students.map((student) => ({ ...student, masteryHistory: filteredEvidence.filter((event) => event.studentId === student.studentId) })), skills: skillDetails, masteryEvents: filteredEvidence, requestHistory, equity,
  };
}

function latestMastery(events: Row[]): Row[] {
  const latest = new Map<string, Row>();
  for (const event of events) latest.set(`${String(event.studentId)}\u0000${String(event.skillId)}`, { studentId: event.studentId, skillId: event.skillId, achievement: event.achievement, requiresSupport: event.requiresSupport, updatedAt: event.timestamp });
  return [...latest.values()];
}

function reportEnd(periods: Row[], query: ReportQuery): string {
  if (query.to) {
    const parsed = new Date(query.to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) parsed.setUTCHours(23, 59, 59, 999);
    return parsed.toISOString();
  }
  return new Date().toISOString();
}

function reportStart(periods: Row[], query: ReportQuery): string {
  if (query.from) return new Date(query.from).toISOString();
  if (query.range === "week") return new Date(Date.now() - 7 * 86400000).toISOString();
  return periods.length ? String(periods[periods.length - 1].startedAt) : "0000-01-01T00:00:00.000Z";
}
