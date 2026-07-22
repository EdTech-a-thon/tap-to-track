import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as XLSX from "xlsx";
import type { AppDatabase } from "./db.js";
import { getClassSnapshot } from "./snapshot.js";
import { buildClassReport } from "./report.js";
import { id, now, object, text, validateRoster } from "./support.js";
import type { TeacherRequest } from "./teacher-routes.js";
import { photoManifest } from "./photo-routes.js";
import { classSettings, participationThreshold, validateParticipationThresholds } from "../src/classSettings.js";

function safeCell(value: unknown): string | number { if (typeof value === "number") return value; const string = String(value ?? ""); return /^(?:[\t\r]|\s*[=+\-@])/.test(string) ? `'${string}` : string; }
function csvCell(value: unknown): string { const string = String(safeCell(value)); return /[",\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string; }

const reportHeaders: Record<string, string[]> = {
  Participation: ["Student", "Eligible class days", "Class days with Positive Action", "Positive Actions", "Redirects", "Class days since Positive Action", "Photo evidence count"],
  Attendance: ["Student", "Present instructional class days", "Absent instructional class days", "Enrolled at", "Archived at"],
  "Parent Skills": ["Student", "Parent skill", "Total", "Evidence", "Meet or exceed", "Requires support", "Not started", "As of"],
  "Leaf Achievements": ["Student", "Skill", "Category", "Parent skill", "Achievement", "Requires support (teacher-only)", "As of"],
  "Achievement History": ["Student", "Skill", "Category", "Previous achievement", "Achievement", "Previous support (teacher-only)", "Requires support (teacher-only)", "Assessed at"],
  "Request History": ["Student", "Request type", "Behavior", "Status", "Joined at", "Acknowledged at", "Resolved at", "Cancelled at", "Updated at"],
  "Photo Evidence": ["Student", "Skill", "Class day", "Assessed at", "Media type", "Filename", "Created at", "Binary included"],
};

function reportRows(report: NonNullable<ReturnType<typeof buildClassReport>>) {
  const participation = report.students.map((student) => ({ Student: student.displayName, "Eligible class days": student.participationEligiblePeriods, "Class days with Positive Action": student.participatedPeriods, "Positive Actions": student.positives, Redirects: student.redirects, "Class days since Positive Action": student.periodsSincePositive, "Photo evidence count": student.photoEvidenceCount }));
  const attendance = report.students.map((student) => ({ Student: student.displayName, "Class days in selected range": student.enrolledPeriods, "Class days present": student.attendedClassDays, "Class days absent": student.absences, "Enrolled at": student.enrolledAt, "Archived at": student.archivedAt }));
  const parents = report.skills.filter((skill) => skill.isParent).flatMap((skill) => (skill.summaries ?? []).map((row) => ({ Student: report.students.find((item) => item.studentId === row.studentId)?.displayName ?? "", "Parent skill": skill.label, Total: row.summary.total, Evidence: row.summary.evidenceCount, "Meet or exceed": row.summary.meetOrExceedCount, "Requires support": row.summary.requiresSupportCount, "Not started": row.summary.notStartedCount, "As of": report.asOf })));
  const achievements = report.skills.filter((skill) => !skill.isParent).flatMap((skill) => (skill.achievements ?? []).map((row) => ({ Student: report.students.find((item) => item.studentId === row.studentId)?.displayName ?? "", Skill: skill.label, Category: skill.category, "Parent skill": report.skills.find((item) => item.id === skill.parentSkillId)?.label ?? "", Achievement: row.achievement, "Requires support (teacher-only)": row.requiresSupport, "As of": report.asOf })));
  const evidence = report.masteryEvents.map((event) => ({ Student: report.students.find((item) => item.studentId === event.studentId)?.displayName ?? "", Skill: event.skillLabel, Category: event.category, "Previous achievement": event.previousAchievement, Achievement: event.achievement, "Previous support (teacher-only)": event.previousRequiresSupport, "Requires support (teacher-only)": event.requiresSupport, "Assessed at": event.timestamp }));
  const requests = report.requestHistory.map((request) => ({ Student: report.students.find((item) => item.studentId === request.studentId)?.displayName ?? "", "Request type": request.requestTypeLabel, Behavior: request.behavior, Status: request.status, "Joined at": request.joinedAt, "Acknowledged at": request.acknowledgedAt, "Resolved at": request.resolvedAt, "Cancelled at": request.cancelledAt, "Updated at": request.updatedAt }));
  const photos = report.photoEvidence.map((photo) => ({ Student: report.students.find((item) => item.studentId === photo.studentId)?.displayName ?? "", Skill: report.skills.find((item) => item.id === photo.skillId)?.label ?? "Deleted skill", "Class day": report.periods.find((item) => item.id === photo.periodId)?.label ?? "", "Assessed at": photo.assessedAt, "Media type": photo.mimeType, Filename: photo.originalFilename, "Created at": photo.createdAt, "Binary included": false }));
  return { Participation: participation, Attendance: attendance, "Parent Skills": parents, "Leaf Achievements": achievements, "Achievement History": evidence, "Request History": requests, "Photo Evidence": photos };
}

export function registerTransferRoutes(app: FastifyInstance, db: AppDatabase, requireTeacher: (request: FastifyRequest, reply: FastifyReply) => Promise<void>) {
  const auth = { preHandler: requireTeacher };
  app.get("/api/classes/:classId/export/:format", auth, async (request, reply) => {
    const { classId, format } = request.params as { classId: string; format: string }; const teacherId = (request as TeacherRequest).teacherId;
    const snapshot = getClassSnapshot(db, teacherId, classId); if (!snapshot) return reply.code(404).send({ error: "Class not found" });
    if (format !== "json") return reply.code(400).send({ error: "Format must be json; use the canonical report export for CSV or Excel" });
    const manifest = photoManifest(db, teacherId, classId).map(({ imageUrl: _imageUrl, ...photo }) => photo);
    return reply.header("content-disposition", `attachment; filename="${classId}.json"`).send({ backupVersion: 1, ...snapshot, photoEvidence: { binaryMediaIncluded: false, restoredFromManifest: false, note: "Photo metadata is informational. Photo binaries are not included and photo records are not restored.", sensitivity: "sensitive teacher-only evidence", manifest } });
  });

  app.get("/api/classes/:classId/reports/export/:format", auth, async (request, reply) => {
    try {
      const { classId, format } = request.params as { classId: string; format: string }; const teacherId = (request as TeacherRequest).teacherId;
      const report = buildClassReport(db, teacherId, classId, request.query as Record<string, string | undefined>);
      if (!report) return reply.code(404).send({ error: "Class not found" });
      const sheets = reportRows(report);
      if (format === "csv") {
        const sections = Object.entries(sheets).map(([name, rows]) => { const headers = reportHeaders[name]; return [`[${name}]`, headers.map(csvCell).join(","), ...rows.map((row) => headers.map((key) => csvCell(row[key as keyof typeof row])).join(","))].join("\n"); });
        return reply.type("text/csv").header("content-disposition", `attachment; filename="${classId}-report.csv"`).send(sections.join("\n\n"));
      }
      if (format === "xlsx") {
        const book = XLSX.utils.book_new();
        for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, safeCell(value)]))), { header: reportHeaders[name] }), name);
        return reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("content-disposition", `attachment; filename="${classId}-report.xlsx"`).send(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer);
      }
      return reply.code(400).send({ error: "Format must be csv or xlsx" });
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.post("/api/import/json", auth, async (request, reply) => {
    try {
      const teacherId = (request as TeacherRequest).teacherId; const body = object(request.body); const source = object(body.classRoom); const students = Array.isArray(body.students) ? body.students : [];
      // PII-free validation: import failures report row positions and generic constraints, never roster field contents.
      const roster = validateRoster(students.map((entry) => { const item = object(entry); return { displayName: item.displayName, avatar: item.avatar }; }));
      if (roster.errors) return reply.code(400).send({ errors: roster.errors });
      const classId = id(); let joinCode = ""; do joinCode = Math.random().toString(36).slice(2, 8).toUpperCase(); while (db.prepare("SELECT 1 FROM classes WHERE joinCode = ?").get(joinCode));
      const settings = classSettings(source.settings);
      settings.participationWatchAfter = participationThreshold(settings.participationWatchAfter, "Watch threshold");
      settings.participationCheckInAfter = participationThreshold(settings.participationCheckInAfter, "Check-in threshold");
      validateParticipationThresholds(settings);
      db.transaction(() => {
        const lens = source.activeLens === "skills" ? "skills" : "participation";
        db.prepare("INSERT INTO classes (id, teacherId, name, activeLens, joinCode, settings, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)").run(classId, teacherId, text(source.name, "Class name", 100), lens, joinCode, JSON.stringify(settings), now());
        const studentMap = new Map<string, string>();
        roster.entries!.forEach((student, index) => { const raw = object(students[index]); const studentId = id(); if (typeof raw.id === "string") studentMap.set(raw.id, studentId); db.prepare("INSERT INTO students (id, teacherId, classId, displayName, avatar, tags, enrolledAt, archived, archivedAt, x, y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(studentId, teacherId, classId, student.displayName, JSON.stringify({ emoji: "🙂", color: "#4f766f", shape: "circle", ...student.avatar }), JSON.stringify(Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : []), typeof raw.enrolledAt === "string" ? raw.enrolledAt : now(), Number(raw.archived === true), typeof raw.archivedAt === "string" ? raw.archivedAt : null, typeof raw.x === "number" ? raw.x : null, typeof raw.y === "number" ? raw.y : null); });
        const skillMap = new Map<string, string>();
        if (Array.isArray(body.skills)) { body.skills.forEach((raw) => { const skill = object(raw); if (typeof skill.id === "string") skillMap.set(skill.id, id()); }); body.skills.forEach((raw, index) => { const skill = object(raw); const sortOrder = Number.isInteger(skill.order) && Number(skill.order) >= 0 ? Number(skill.order) : index; db.prepare("INSERT INTO skills (id, teacherId, classId, label, category, sortOrder, visibleToStudents, parentSkillId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(typeof skill.id === "string" ? skillMap.get(skill.id) : id(), teacherId, classId, text(skill.label, "Skill label"), typeof skill.category === "string" ? skill.category.slice(0, 120) : "", sortOrder, Number(skill.visibleToStudents === true), typeof skill.parentSkillId === "string" ? skillMap.get(skill.parentSkillId) ?? null : null); }); }
        const periodMap = new Map<string, string>();
        if (Array.isArray(body.periods)) { body.periods.forEach((raw) => { const period = object(raw); if (typeof period.id === "string") periodMap.set(period.id, id()); }); let liveRestored = false; body.periods.forEach((raw) => { const period = object(raw); let status = ["scheduled", "live", "closed"].includes(String(period.status)) ? String(period.status) : period.scheduled === true ? "scheduled" : period.active === true ? "live" : "closed"; if (status === "live" && liveRestored) status = "closed"; if (status === "live") liveRestored = true; db.prepare("INSERT INTO periods (id, teacherId, classId, label, startedAt, endedAt, status, active, scheduled, attendanceCompletedAt, reopenedAt, type, participationExpected, teacherNote) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(typeof period.id === "string" ? periodMap.get(period.id) : id(), teacherId, classId, text(period.label, "Period label", 100), typeof period.startedAt === "string" ? period.startedAt : now(), status === "live" ? null : typeof period.endedAt === "string" ? period.endedAt : null, status, Number(status === "live"), Number(status === "scheduled"), typeof period.attendanceCompletedAt === "string" ? period.attendanceCompletedAt : null, typeof period.reopenedAt === "string" ? period.reopenedAt : null, ["instructional", "independent", "assessment", "no-participation"].includes(String(period.type)) ? period.type : "instructional", Number(period.participationExpected !== false), typeof period.teacherNote === "string" ? period.teacherNote.slice(0, 500) : null); }); }
        const requestMap = new Map<string, string>();
        if (Array.isArray(body.requestTypes)) body.requestTypes.forEach((raw) => { const item = object(raw); const requestId = id(); if (typeof item.id === "string") requestMap.set(item.id, requestId); const behavior = ["attention", "presence", "completion", "custom"].includes(String(item.behavior)) ? String(item.behavior) : item.isAttentionLane === true ? "attention" : String(item.label).toLowerCase() === "bathroom" ? "presence" : String(item.label).toLowerCase() === "done" ? "completion" : "custom"; db.prepare("INSERT INTO request_types (id, teacherId, classId, label, color, isAttentionLane, behavior, resolveLabel) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(requestId, teacherId, classId, text(item.label, "Request label", 80), typeof item.color === "string" ? item.color : "#4f766f", Number(behavior === "attention"), behavior, typeof item.resolveLabel === "string" && item.resolveLabel.trim() ? item.resolveLabel.slice(0, 80) : "Resolve"); });
        if (Array.isArray(body.mastery)) body.mastery.forEach((raw) => { const item = object(raw); const studentId = typeof item.studentId === "string" ? studentMap.get(item.studentId) : undefined; const skillId = typeof item.skillId === "string" ? skillMap.get(item.skillId) : undefined; if (studentId && skillId && ["not_started", "approaching", "meets", "exceeds"].includes(String(item.achievement))) db.prepare("INSERT INTO mastery (teacherId, classId, studentId, skillId, achievement, requiresSupport, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)").run(teacherId, classId, studentId, skillId, item.achievement, Number(item.requiresSupport === true), typeof item.updatedAt === "string" ? item.updatedAt : now()); });
        if (Array.isArray(body.masteryEvents)) body.masteryEvents.forEach((raw) => { const event = object(raw); const studentId = typeof event.studentId === "string" ? studentMap.get(event.studentId) : undefined; const mappedSkillId = typeof event.skillId === "string" ? skillMap.get(event.skillId) : undefined; const levels = ["not_started", "approaching", "meets", "exceeds"]; if (studentId && levels.includes(String(event.achievement))) db.prepare("INSERT INTO mastery_events (id, teacherId, classId, studentId, skillId, previousAchievement, achievement, previousRequiresSupport, requiresSupport, timestamp, periodId, skillLabel, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id(), teacherId, classId, studentId, mappedSkillId ?? `deleted:${id()}`, levels.includes(String(event.previousAchievement)) ? event.previousAchievement : "not_started", event.achievement, Number(event.previousRequiresSupport === true), Number(event.requiresSupport === true), typeof event.timestamp === "string" ? event.timestamp : now(), typeof event.periodId === "string" ? periodMap.get(event.periodId) ?? null : null, typeof event.skillLabel === "string" ? event.skillLabel : "Deleted skill", typeof event.category === "string" ? event.category : ""); });
        if (Array.isArray(body.attendance)) body.attendance.forEach((raw) => { const item = object(raw); const periodId = typeof item.periodId === "string" ? periodMap.get(item.periodId) : undefined; const studentId = typeof item.studentId === "string" ? studentMap.get(item.studentId) : undefined; if (periodId && studentId && ["present", "absent"].includes(String(item.status))) db.prepare("INSERT INTO attendance (teacherId, classId, periodId, studentId, status) VALUES (?, ?, ?, ?, ?)").run(teacherId, classId, periodId, studentId, item.status); });
        if (Array.isArray(body.events)) body.events.forEach((raw) => { const event = object(raw); const periodId = typeof event.periodId === "string" ? periodMap.get(event.periodId) : undefined; const studentId = typeof event.studentId === "string" ? studentMap.get(event.studentId) : undefined; if (periodId && studentId && ["part+", "part-", "request"].includes(String(event.type))) db.prepare("INSERT INTO events (id, teacherId, classId, studentId, periodId, type, requestTypeId, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id(), teacherId, classId, studentId, periodId, event.type, typeof event.requestTypeId === "string" ? requestMap.get(event.requestTypeId) ?? null : null, typeof event.timestamp === "string" ? event.timestamp : now()); });
        const requestHistory = Array.isArray(body.requestHistory) ? body.requestHistory : Array.isArray(body.requests) ? body.requests : [];
        requestHistory.forEach((raw) => { const item = object(raw); const studentId = typeof item.studentId === "string" ? studentMap.get(item.studentId) : undefined; const requestTypeId = typeof item.requestTypeId === "string" ? requestMap.get(item.requestTypeId) : undefined; const status = ["active", "acknowledged", "resolved", "cancelled"].includes(String(item.status)) ? String(item.status) : "active"; if (studentId && requestTypeId) { const joinedAt = typeof item.joinedAt === "string" ? item.joinedAt : now(); db.prepare("INSERT INTO requests (id, teacherId, classId, studentId, requestTypeId, status, joinedAt, acknowledgedAt, resolvedAt, cancelledAt, resolvedBy, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id(), teacherId, classId, studentId, requestTypeId, status, joinedAt, typeof item.acknowledgedAt === "string" ? item.acknowledgedAt : null, typeof item.resolvedAt === "string" ? item.resolvedAt : null, typeof item.cancelledAt === "string" ? item.cancelledAt : null, status === "resolved" ? teacherId : null, typeof item.updatedAt === "string" ? item.updatedAt : joinedAt); } });
        if (Array.isArray(body.tags)) body.tags.forEach((raw) => { const item = object(raw); db.prepare("INSERT INTO tags (id, teacherId, classId, label) VALUES (?, ?, ?, ?)").run(id(), teacherId, classId, text(item.label, "Tag label", 80)); });
        if (Array.isArray(body.rosterImports)) body.rosterImports.forEach((raw) => { const item = object(raw); db.prepare("INSERT INTO roster_imports (id, teacherId, classId, createdAt) VALUES (?, ?, ?, ?)").run(id(), teacherId, classId, typeof item.createdAt === "string" ? item.createdAt : now()); });
      })();
      return reply.code(201).send({ classId });
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });
}
