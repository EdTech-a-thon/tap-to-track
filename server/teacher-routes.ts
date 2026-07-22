import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppDatabase } from "./db.js";
import { getClassSnapshot, getTeacherClasses } from "./snapshot.js";
import { buildClassReport } from "./report.js";
import { boolean, id, now, object, oneOf, optionalText, text, validateRoster } from "./support.js";
import { achievementLevels, normalizedSkill, parentSummary } from "./mastery.js";
import { deletePhotoFiles } from "./photo-routes.js";
import { classSettings, defaultClassSettings, participationThreshold, validateParticipationThresholds } from "../src/classSettings.js";

export interface TeacherRequest extends FastifyRequest { teacherId: string }

const defaultAvatar = { emoji: "🙂", color: "#4f766f", shape: "circle" };
const avatarEmojis = ["🙂", "😀", "😎", "🤓", "🦊", "🐼", "🐙", "🌻", "⭐", "🚀"];
const avatarColors = ["#4f766f", "#3178a8", "#7656a8", "#7a6b42", "#c47b24", "#4b9d74"];
const avatarShapes = ["circle", "rounded", "square"];

function params(request: FastifyRequest): Record<string, string> {
  return request.params as Record<string, string>;
}

function ownedClass(db: AppDatabase, teacherId: string, classId: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM classes WHERE id = ? AND teacherId = ?").get(classId, teacherId));
}

function activePeriod(db: AppDatabase, teacherId: string, classId: string) {
  return db.prepare("SELECT id FROM periods WHERE teacherId = ? AND classId = ? AND status = 'live' ORDER BY startedAt DESC LIMIT 1").get(teacherId, classId) as { id: string } | undefined;
}

type PeriodStatus = "scheduled" | "live" | "closed";

function closeLivePeriod(db: AppDatabase, teacherId: string, classId: string, timestamp: string, exceptId?: string) {
  db.prepare(`UPDATE periods SET status = 'closed', active = 0, scheduled = 0, endedAt = COALESCE(endedAt, ?)
    WHERE teacherId = ? AND classId = ? AND status = 'live' AND id != ?`).run(timestamp, teacherId, classId, exceptId ?? "");
}

function createPeriodAttendance(db: AppDatabase, teacherId: string, classId: string, periodId: string, startedAt: string) {
  db.prepare(`INSERT OR IGNORE INTO attendance (teacherId, classId, periodId, studentId, status)
    SELECT teacherId, classId, ?, id, 'present' FROM students
    WHERE teacherId = ? AND classId = ? AND enrolledAt <= ?
      AND (archivedAt IS NULL OR archivedAt > ?)`).run(periodId, teacherId, classId, startedAt, startedAt);
}

function calendarDate(value: unknown, name = "Date"): { day: string; timestamp: string } {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${name} must be a valid ISO date`);
  const localDate = /^(\d{4}-\d{2}-\d{2})$/.exec(value);
  if (localDate) return { day: localDate[1], timestamp: `${localDate[1]}T00:00:00.000Z` };
  const parsed = new Date(value);
  return { day: parsed.toISOString().slice(0, 10), timestamp: parsed.toISOString() };
}

function nextCalendarDay(day: string): string {
  const next = new Date(`${day}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function notify(app: FastifyInstance, classId: string, type = "update") {
  app.broadcastClass?.(classId, { type, classId });
}

type StudentRefreshReason = "attendance" | "mastery" | "class-day" | "settings" | "request-types" | "student-profile";

function refreshStudents(app: FastifyInstance, classId: string, reason: StudentRefreshReason, studentIds?: string[]) {
  const message = { type: "student-refresh", classId, reason };
  if (studentIds) studentIds.forEach((studentId) => app.notifyStudent?.(classId, studentId, message));
  else app.broadcastClass?.(classId, message);
}

function notifyRequest(app: FastifyInstance, classId: string, requestId: string, studentId: string) {
  const message = { type: "request-updated", classId, requestId, studentId };
  app.broadcastClass?.(classId, message);
  app.notifyStudent?.(classId, studentId, message);
}

type TimerRow = {
  teacherId: string; classId: string; periodId: string; status: "running" | "paused" | "stopped" | "finished";
  label: string; durationSeconds: number; endsAt: string | null; remainingSeconds: number; revision: number; updatedAt: string;
};

function timerState(db: AppDatabase, teacherId: string, classId: string): TimerRow | null {
  const timer = db.prepare("SELECT * FROM class_timers WHERE teacherId = ? AND classId = ?").get(teacherId, classId) as TimerRow | undefined;
  if (!timer) return null;
  if (timer.status === "running" && timer.endsAt && Date.parse(timer.endsAt) <= Date.now()) {
    const updatedAt = now();
    db.prepare("UPDATE class_timers SET status = 'finished', endsAt = NULL, remainingSeconds = 0, revision = revision + 1, updatedAt = ? WHERE teacherId = ? AND classId = ? AND revision = ?")
      .run(updatedAt, teacherId, classId, timer.revision);
    return db.prepare("SELECT * FROM class_timers WHERE teacherId = ? AND classId = ?").get(teacherId, classId) as TimerRow;
  }
  return timer;
}

function notifyTimer(app: FastifyInstance, timer: TimerRow) {
  app.broadcastClass?.(timer.classId, { type: "timer-state", classId: timer.classId, timer });
}

export function registerTeacherRoutes(app: FastifyInstance, db: AppDatabase, photoDir: string, requireTeacher: (request: FastifyRequest, reply: FastifyReply) => Promise<void>) {
  const auth = { preHandler: requireTeacher };

  app.get("/api/teacher/snapshot", auth, async (request) => {
    const teacherId = (request as TeacherRequest).teacherId;
    const classes = getTeacherClasses(db, teacherId);
    return { classes, snapshots: classes.map((room) => getClassSnapshot(db, teacherId, String(room.id))) };
  });

  app.get("/api/classes", auth, async (request) => ({ classes: getTeacherClasses(db, (request as TeacherRequest).teacherId) }));

  app.get("/api/calendar", auth, async (request, reply) => {
    try {
      const teacherId = (request as TeacherRequest).teacherId;
      const query = request.query as Record<string, unknown>;
      const from = calendarDate(query.from, "From");
      const to = calendarDate(query.to, "To");
      if (from.day > to.day) return reply.code(400).send({ error: "From must not be after to" });
      const periods = db.prepare(`SELECT p.id, p.classId, c.name className, p.label, p.startedAt, p.endedAt,
        p.status, p.active, p.scheduled, p.attendanceCompletedAt, p.reopenedAt, p.type, p.participationExpected, p.teacherNote
        FROM periods p JOIN classes c ON c.id = p.classId AND c.teacherId = p.teacherId
        WHERE p.teacherId = ? AND p.startedAt >= ? AND p.startedAt < ?
        ORDER BY p.startedAt, c.name`).all(teacherId, `${from.day}T00:00:00.000Z`, nextCalendarDay(to.day)) as Record<string, unknown>[];
      return {
        classes: getTeacherClasses(db, teacherId),
        periods: periods.map((period) => ({ ...period, active: Boolean(period.active), scheduled: Boolean(period.scheduled), participationExpected: Boolean(period.participationExpected) })),
      };
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.post("/api/calendar/days", auth, async (request, reply) => {
    try {
      const teacherId = (request as TeacherRequest).teacherId;
      const body = object(request.body);
      const date = calendarDate(body.date);
      const scope = oneOf(body.scope, ["all", "selected"] as const, "Scope");
      const type = oneOf(body.type, ["instructional", "independent", "assessment", "no-participation"] as const, "Period type");
      const participationExpected = boolean(body.participationExpected, "Participation expected");
      const owned = db.prepare("SELECT id FROM classes WHERE teacherId = ? ORDER BY createdAt").all(teacherId) as { id: string }[];
      let classIds = owned.map((room) => room.id);
      if (scope === "selected") {
        if (!Array.isArray(body.classIds) || !body.classIds.length || body.classIds.some((classId) => typeof classId !== "string")) throw new Error("classIds must be a non-empty array");
        classIds = [...new Set(body.classIds as string[])];
        if (classIds.some((classId) => !owned.some((room) => room.id === classId))) return reply.code(404).send({ error: "Class not found" });
      }
      const teacherNote = optionalText(body.teacherNote, "Teacher note", 500) ?? null;
      const created: { id: string; classId: string }[] = [];
      const skipped: string[] = [];
      db.transaction(() => {
        for (const classId of classIds) {
          if (db.prepare("SELECT 1 FROM periods WHERE teacherId = ? AND classId = ? AND startedAt >= ? AND startedAt < ?").get(teacherId, classId, date.timestamp, nextCalendarDay(date.day))) {
            skipped.push(classId);
            continue;
          }
          const periodId = id();
          db.prepare(`INSERT INTO periods (id, teacherId, classId, label, startedAt, status, active, scheduled, type, participationExpected, teacherNote)
            VALUES (?, ?, ?, ?, ?, 'scheduled', 0, 1, ?, ?, ?)`).run(periodId, teacherId, classId, date.day, date.timestamp, type, Number(participationExpected), teacherNote);
          created.push({ id: periodId, classId });
        }
      })();
      for (const classId of classIds) notify(app, classId, "period");
      return reply.code(201).send({ created, skipped });
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.post("/api/classes", auth, async (request, reply) => {
    try {
      const body = object(request.body);
      const teacherId = (request as TeacherRequest).teacherId;
      const classId = id();
      let joinCode = "";
      do joinCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      while (db.prepare("SELECT 1 FROM classes WHERE joinCode = ?").get(joinCode));
      db.prepare("INSERT INTO classes (id, teacherId, name, activeLens, joinCode, settings, createdAt) VALUES (?, ?, ?, 'participation', ?, ?, ?)")
        .run(classId, teacherId, text(body.name, "Class name", 100), joinCode, JSON.stringify(defaultClassSettings), now());
      const startedAt = now();
      db.prepare("INSERT INTO periods (id, teacherId, classId, label, startedAt, status, active, scheduled) VALUES (?, ?, ?, ?, ?, 'live', 1, 0)").run(id(), teacherId, classId, new Date().toLocaleDateString(), startedAt);
      const addRequest = db.prepare("INSERT INTO request_types (id, teacherId, classId, label, color, isAttentionLane, behavior, resolveLabel) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      addRequest.run(id(), teacherId, classId, "Need help", "#315f87", 1, "attention", "Helped");
      addRequest.run(id(), teacherId, classId, "Bathroom", "#edbd4c", 0, "presence", "Returned");
      addRequest.run(id(), teacherId, classId, "Done", "#4b9d74", 0, "completion", "Reviewed");
      return reply.code(201).send(getClassSnapshot(db, teacherId, classId)?.classRoom);
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.patch("/api/classes/:classId", auth, async (request, reply) => {
    try {
      const { classId } = params(request);
      const teacherId = (request as TeacherRequest).teacherId;
      const body = object(request.body);
      if (!ownedClass(db, teacherId, classId)) return reply.code(404).send({ error: "Class not found" });
      const room = db.prepare("SELECT name, activeLens, settings FROM classes WHERE id = ? AND teacherId = ?").get(classId, teacherId) as { name: string; activeLens: string; settings: string };
      const name = body.name === undefined ? room.name : text(body.name, "Class name", 100);
      const lens = body.activeLens === undefined ? room.activeLens : oneOf(body.activeLens, ["participation", "skills"] as const, "Active lens");
      let settings = room.settings;
      if (body.settings !== undefined) {
        const updates = object(body.settings);
        const next = classSettings(JSON.parse(room.settings));
        if (updates.participationWatchAfter !== undefined) next.participationWatchAfter = participationThreshold(updates.participationWatchAfter, "Watch threshold");
        if (updates.participationCheckInAfter !== undefined) next.participationCheckInAfter = participationThreshold(updates.participationCheckInAfter, "Check-in threshold");
        validateParticipationThresholds(next);
        settings = JSON.stringify({ ...next, ...updates, participationWatchAfter: next.participationWatchAfter, participationCheckInAfter: next.participationCheckInAfter });
      }
      db.prepare("UPDATE classes SET name = ?, activeLens = ?, settings = ? WHERE id = ? AND teacherId = ?").run(name, lens, settings, classId, teacherId);
      notify(app, classId);
      if (name !== room.name || settings !== room.settings) refreshStudents(app, classId, "settings");
      return getClassSnapshot(db, teacherId, classId)?.classRoom;
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.delete("/api/classes/:classId", auth, async (request, reply) => {
    const { classId } = params(request);
    const teacherId = (request as TeacherRequest).teacherId;
    const files = (db.prepare("SELECT storageKey FROM skill_evidence_photos WHERE classId = ? AND teacherId = ?").all(classId, teacherId) as { storageKey: string }[]).map((photo) => photo.storageKey);
    const result = db.transaction(() => {
      db.prepare("DELETE FROM skill_evidence_photos WHERE classId = ? AND teacherId = ?").run(classId, teacherId);
      for (const table of ["requests", "request_types", "events", "attendance", "periods", "mastery", "mastery_events", "skills", "tags", "roster_imports", "students"])
        db.prepare(`DELETE FROM ${table} WHERE classId = ? AND teacherId = ?`).run(classId, teacherId);
      return db.prepare("DELETE FROM classes WHERE id = ? AND teacherId = ?").run(classId, teacherId);
    })();
    if (result.changes) await deletePhotoFiles(photoDir, files);
    return result.changes ? reply.code(204).send() : reply.code(404).send({ error: "Class not found" });
  });

  app.get("/api/classes/:classId/snapshot", auth, async (request, reply) => {
    const snapshot = getClassSnapshot(db, (request as TeacherRequest).teacherId, params(request).classId);
    return snapshot ?? reply.code(404).send({ error: "Class not found" });
  });

  app.get("/api/classes/:classId/reports", auth, async (request, reply) => {
    try {
      const report = buildClassReport(db, (request as TeacherRequest).teacherId, params(request).classId, request.query as Record<string, string | undefined>);
      return report ?? reply.code(404).send({ error: "Class not found" });
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.get("/api/classes/:classId/participation-actions", auth, async (request, reply) => {
    try {
      const { classId } = params(request); const teacherId = (request as TeacherRequest).teacherId;
      if (!ownedClass(db, teacherId, classId)) return reply.code(404).send({ error: "Class not found" });
      const query = request.query as Record<string, unknown>;
      const periodId = optionalText(query.periodId, "Period ID");
      const studentId = optionalText(query.studentId, "Student ID");
      const from = query.from === undefined ? undefined : calendarDate(query.from, "From").timestamp;
      const toDate = query.to === undefined ? undefined : calendarDate(query.to, "To");
      const to = toDate ? (/^\d{4}-\d{2}-\d{2}$/.test(String(query.to)) ? nextCalendarDay(toDate.day) : toDate.timestamp) : undefined;
      const actions = db.prepare(`SELECT e.id, e.type, e.timestamp, e.studentId, s.displayName,
        e.periodId, p.label classDayLabel, p.startedAt classDayStartedAt, p.status periodStatus
        FROM events e
        JOIN students s ON s.id = e.studentId AND s.classId = e.classId AND s.teacherId = e.teacherId
        JOIN periods p ON p.id = e.periodId AND p.classId = e.classId AND p.teacherId = e.teacherId
        WHERE e.teacherId = ? AND e.classId = ? AND e.type IN ('part+', 'part-')
          AND (? IS NULL OR e.periodId = ?) AND (? IS NULL OR e.studentId = ?)
          AND (? IS NULL OR e.timestamp >= ?) AND (? IS NULL OR e.timestamp < ?)
        ORDER BY e.timestamp DESC, e.rowid DESC`).all(teacherId, classId, periodId ?? null, periodId ?? null,
          studentId ?? null, studentId ?? null, from ?? null, from ?? null, to ?? null, to ?? null);
      return { actions };
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.patch("/api/classes/:classId/events/:eventId", auth, async (request, reply) => {
    try {
      const { classId, eventId } = params(request); const teacherId = (request as TeacherRequest).teacherId;
      const type = oneOf(object(request.body).type, ["part+", "part-"] as const, "Event type");
      const event = db.prepare(`SELECT e.id, e.studentId, e.periodId, p.status FROM events e
        JOIN periods p ON p.id = e.periodId AND p.classId = e.classId AND p.teacherId = e.teacherId
        WHERE e.id = ? AND e.classId = ? AND e.teacherId = ? AND e.type IN ('part+', 'part-')`).get(eventId, classId, teacherId) as { id: string; studentId: string; periodId: string; status: PeriodStatus } | undefined;
      if (!event) return reply.code(404).send({ error: "Participation action not found" });
      db.prepare("UPDATE events SET type = ? WHERE id = ? AND classId = ? AND teacherId = ?").run(type, eventId, classId, teacherId);
      notify(app, classId);
      return { ...event, type };
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.get("/api/classes/:classId/timer", auth, async (request, reply) => {
    const { classId } = params(request); const teacherId = (request as TeacherRequest).teacherId;
    if (!ownedClass(db, teacherId, classId)) return reply.code(404).send({ error: "Class not found" });
    return { timer: timerState(db, teacherId, classId) };
  });

  app.post("/api/classes/:classId/timer/:action", auth, async (request, reply) => {
    try {
      const { classId, action } = params(request); const teacherId = (request as TeacherRequest).teacherId;
      if (!ownedClass(db, teacherId, classId)) return reply.code(404).send({ error: "Class not found" });
      const body = object(request.body ?? {}); const timestamp = now();
      const period = activePeriod(db, teacherId, classId);
      if (!period && action !== "stop") return reply.code(409).send({ error: "Start the class day before using a timer" });
      let current = timerState(db, teacherId, classId);
      if (action === "start") {
        const durationSeconds = Number(body.durationSeconds);
        if (!Number.isInteger(durationSeconds) || durationSeconds < 10 || durationSeconds > 24 * 60 * 60) throw new Error("Duration must be from 10 seconds to 24 hours");
        const label = optionalText(body.label, "Timer label", 80) ?? "Class timer";
        const endsAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
        db.prepare(`INSERT INTO class_timers (teacherId, classId, periodId, status, label, durationSeconds, endsAt, remainingSeconds, revision, updatedAt)
          VALUES (?, ?, ?, 'running', ?, ?, ?, ?, 1, ?)
          ON CONFLICT(classId) DO UPDATE SET teacherId=excluded.teacherId, periodId=excluded.periodId, status='running', label=excluded.label,
          durationSeconds=excluded.durationSeconds, endsAt=excluded.endsAt, remainingSeconds=excluded.remainingSeconds, revision=class_timers.revision+1, updatedAt=excluded.updatedAt`)
          .run(teacherId, classId, period!.id, label, durationSeconds, endsAt, durationSeconds, timestamp);
      } else if (!current) return reply.code(409).send({ error: "No timer has been started" });
      else if (action === "pause") {
        if (current.status !== "running") return reply.code(409).send({ error: "Only a running timer can be paused" });
        const remaining = Math.max(0, Math.ceil((Date.parse(current.endsAt!) - Date.now()) / 1000));
        db.prepare("UPDATE class_timers SET status = ?, endsAt = NULL, remainingSeconds = ?, revision = revision + 1, updatedAt = ? WHERE teacherId = ? AND classId = ?")
          .run(remaining ? "paused" : "finished", remaining, timestamp, teacherId, classId);
      } else if (action === "resume") {
        if (current.status !== "paused") return reply.code(409).send({ error: "Only a paused timer can be resumed" });
        const endsAt = new Date(Date.now() + current.remainingSeconds * 1000).toISOString();
        db.prepare("UPDATE class_timers SET status = 'running', endsAt = ?, revision = revision + 1, updatedAt = ? WHERE teacherId = ? AND classId = ?").run(endsAt, timestamp, teacherId, classId);
      } else if (action === "stop") {
        db.prepare("UPDATE class_timers SET status = 'stopped', endsAt = NULL, remainingSeconds = 0, revision = revision + 1, updatedAt = ? WHERE teacherId = ? AND classId = ?").run(timestamp, teacherId, classId);
      } else if (action === "add-time") {
        const seconds = Number(body.seconds);
        if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) throw new Error("Added time must be from 1 to 3600 seconds");
        const remaining = current.status === "running" ? Math.max(0, Math.ceil((Date.parse(current.endsAt!) - Date.now()) / 1000)) : current.remainingSeconds;
        const nextRemaining = remaining + seconds;
        const endsAt = current.status === "running" ? new Date(Date.now() + nextRemaining * 1000).toISOString() : null;
        db.prepare("UPDATE class_timers SET remainingSeconds = ?, endsAt = ?, revision = revision + 1, updatedAt = ? WHERE teacherId = ? AND classId = ?").run(nextRemaining, endsAt, timestamp, teacherId, classId);
      } else return reply.code(404).send({ error: "Timer action not found" });
      current = timerState(db, teacherId, classId)!; notifyTimer(app, current); return { timer: current };
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.post("/api/classes/:classId/roster", auth, async (request, reply) => {
    const { classId } = params(request);
    const teacherId = (request as TeacherRequest).teacherId;
    if (!ownedClass(db, teacherId, classId)) return reply.code(404).send({ error: "Class not found" });
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
    const importId = optionalText(body.importId, "Import ID", 100) ?? id();
    if (db.prepare("SELECT 1 FROM roster_imports WHERE id = ? AND teacherId = ? AND classId = ?").get(importId, teacherId, classId)) {
      return reply.code(200).send({ created: [], replayed: true });
    }
    // PII-free validation: only row positions and rule descriptions are returned; names are never copied into errors or logs.
    const validation = validateRoster(Array.isArray(request.body) ? request.body : body.students);
    if (validation.errors) return reply.code(400).send({ errors: validation.errors });
      const insert = db.prepare("INSERT INTO students (id, teacherId, classId, displayName, avatar, tags, enrolledAt) VALUES (?, ?, ?, ?, ?, '[]', ?)");
      const period = activePeriod(db, teacherId, classId);
      const created = db.transaction(() => {
      db.prepare("INSERT INTO roster_imports (id, teacherId, classId, createdAt) VALUES (?, ?, ?, ?)").run(importId, teacherId, classId, now());
      return validation.entries!.map((entry) => {
        const studentId = id();
        const avatar = { ...defaultAvatar, ...entry.avatar };
        insert.run(studentId, teacherId, classId, entry.displayName, JSON.stringify(avatar), now());
        if (period) db.prepare("INSERT OR IGNORE INTO attendance (teacherId, classId, periodId, studentId, status) VALUES (?, ?, ?, ?, 'present')").run(teacherId, classId, period.id, studentId);
        return studentId;
      });
    })();
    notify(app, classId);
    return reply.code(201).send({ created });
  });

  app.patch("/api/classes/:classId/students/:studentId", auth, async (request, reply) => {
    try {
      const { classId, studentId } = params(request);
      const teacherId = (request as TeacherRequest).teacherId;
      const body = object(request.body);
      const row = db.prepare("SELECT displayName, avatar, tags, archived, enrolledAt, archivedAt, x, y FROM students WHERE id = ? AND classId = ? AND teacherId = ?").get(studentId, classId, teacherId) as Record<string, unknown> | undefined;
      if (!row) return reply.code(404).send({ error: "Student not found" });
      const displayName = body.displayName === undefined ? row.displayName : text(body.displayName, "Display name", 80);
      let avatar = row.avatar;
      if (body.avatar !== undefined) {
        const nextAvatar = object(body.avatar);
        avatar = JSON.stringify({
          emoji: oneOf(nextAvatar.emoji, avatarEmojis, "Avatar emoji"),
          color: oneOf(nextAvatar.color, avatarColors, "Avatar color"),
          shape: oneOf(nextAvatar.shape, avatarShapes, "Avatar shape"),
        });
      }
      const tags = body.tags === undefined ? row.tags : JSON.stringify(Array.isArray(body.tags) ? body.tags.map((tag) => text(tag, "Tag", 50)) : (() => { throw new Error("Tags must be an array"); })());
      const archived = body.archived === undefined ? row.archived : Number(boolean(body.archived, "Archived"));
      const archivedAt = archived ? (row.archived ? row.archivedAt : now()) : null;
      let enrolledAt = row.enrolledAt;
      if (body.enrolledAt !== undefined) {
        if (typeof body.enrolledAt !== "string" || Number.isNaN(Date.parse(body.enrolledAt))) throw new Error("Enrollment date must be a valid date");
        enrolledAt = new Date(body.enrolledAt).toISOString();
      }
      db.prepare("UPDATE students SET displayName = ?, avatar = ?, tags = ?, archived = ?, archivedAt = ?, enrolledAt = ?, x = ?, y = ? WHERE id = ? AND classId = ? AND teacherId = ?")
        .run(displayName, avatar, tags, archived, archivedAt, enrolledAt, body.x ?? row.x, body.y ?? row.y, studentId, classId, teacherId);
      notify(app, classId);
      refreshStudents(app, classId, "student-profile", [studentId]);
      return { ok: true };
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.post("/api/classes/:classId/seating/reset", auth, async (request, reply) => {
    const { classId } = params(request);
    const teacherId = (request as TeacherRequest).teacherId;
    if (!ownedClass(db, teacherId, classId)) return reply.code(404).send({ error: "Class not found" });
    const result = db.prepare("UPDATE students SET x = NULL, y = NULL WHERE classId = ? AND teacherId = ? AND (x IS NOT NULL OR y IS NOT NULL)").run(classId, teacherId);
    notify(app, classId);
    return { reset: result.changes };
  });

  app.delete("/api/classes/:classId/students/:studentId", auth, async (request, reply) => {
    const { classId, studentId } = params(request);
    const teacherId = (request as TeacherRequest).teacherId;
    const files = (db.prepare("SELECT storageKey FROM skill_evidence_photos WHERE studentId = ? AND classId = ? AND teacherId = ?").all(studentId, classId, teacherId) as { storageKey: string }[]).map((photo) => photo.storageKey);
    const result = db.transaction(() => {
      db.prepare("DELETE FROM skill_evidence_photos WHERE studentId = ? AND classId = ? AND teacherId = ?").run(studentId, classId, teacherId);
      for (const table of ["requests", "events", "attendance", "mastery", "mastery_events"])
        db.prepare(`DELETE FROM ${table} WHERE studentId = ? AND classId = ? AND teacherId = ?`).run(studentId, classId, teacherId);
      return db.prepare("DELETE FROM students WHERE id = ? AND classId = ? AND teacherId = ?").run(studentId, classId, teacherId);
    })();
    if (!result.changes) return reply.code(404).send({ error: "Student not found" });
    await deletePhotoFiles(photoDir, files);
    notify(app, classId);
    return reply.code(204).send();
  });

  app.post("/api/classes/:classId/periods", auth, async (request, reply) => {
    try {
      const { classId } = params(request);
      const teacherId = (request as TeacherRequest).teacherId;
      if (!ownedClass(db, teacherId, classId)) return reply.code(404).send({ error: "Class not found" });
      const body = object(request.body ?? {});
      const type = body.type === undefined ? "instructional" : oneOf(body.type, ["instructional", "independent", "assessment", "no-participation"] as const, "Period type");
      const participationExpected = body.participationExpected === undefined ? true : boolean(body.participationExpected, "Participation expected");
      const periodId = id();
      const startedAt = now();
      const day = startedAt.slice(0, 10);
      if (db.prepare("SELECT 1 FROM periods WHERE teacherId = ? AND classId = ? AND scheduled = 1 AND startedAt >= ? AND startedAt < ?").get(teacherId, classId, `${day}T00:00:00.000Z`, nextCalendarDay(day))) {
        return reply.code(409).send({ error: "A scheduled class day already exists for this date; start it instead" });
      }
      db.transaction(() => {
        closeLivePeriod(db, teacherId, classId, startedAt);
        db.prepare("INSERT INTO periods (id, teacherId, classId, label, startedAt, status, active, scheduled, type, participationExpected, teacherNote) VALUES (?, ?, ?, ?, ?, 'live', 1, 0, ?, ?, ?)").run(periodId, teacherId, classId, optionalText(body.label, "Period label", 100) ?? new Date().toLocaleDateString(), startedAt, type, Number(participationExpected), optionalText(body.teacherNote, "Teacher note", 500) ?? null);
        createPeriodAttendance(db, teacherId, classId, periodId, startedAt);
      })();
      notify(app, classId, "period");
      refreshStudents(app, classId, "class-day");
      return reply.code(201).send({ id: periodId, classId, label: body.label, startedAt, endedAt: null, status: "live", active: true, scheduled: false, attendanceCompletedAt: null, reopenedAt: null, type, participationExpected, teacherNote: body.teacherNote ?? null });
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.post("/api/classes/:classId/periods/:periodId/start", auth, async (request, reply) => {
    const { classId, periodId } = params(request);
    const teacherId = (request as TeacherRequest).teacherId;
    const period = db.prepare("SELECT startedAt, status FROM periods WHERE id = ? AND classId = ? AND teacherId = ?").get(periodId, classId, teacherId) as { startedAt: string; status: PeriodStatus } | undefined;
    if (!period) return reply.code(404).send({ error: "Period not found" });
    if (period.status === "live") return reply.code(409).send({ error: "Class day is already in progress" });
    const today = now();
    const startedAt = period.startedAt.slice(0, 10) === today.slice(0, 10) ? today : period.startedAt;
    db.transaction(() => {
      closeLivePeriod(db, teacherId, classId, startedAt, periodId);
      db.prepare("UPDATE periods SET status = 'live', scheduled = 0, active = 1, startedAt = ?, endedAt = NULL WHERE id = ? AND classId = ? AND teacherId = ? AND status IN ('scheduled', 'closed')").run(startedAt, periodId, classId, teacherId);
      createPeriodAttendance(db, teacherId, classId, periodId, startedAt);
    })();
    notify(app, classId, "period");
    refreshStudents(app, classId, "class-day");
    return { id: periodId, classId, startedAt, status: "live", active: true, scheduled: false };
  });

  app.post("/api/classes/:classId/periods/:periodId/finish", auth, async (request, reply) => {
    const { classId, periodId } = params(request); const teacherId = (request as TeacherRequest).teacherId; const timestamp = now();
    const body = object(request.body ?? {});
    const period = db.prepare("SELECT status, attendanceCompletedAt FROM periods WHERE id = ? AND classId = ? AND teacherId = ?").get(periodId, classId, teacherId) as { status: PeriodStatus; attendanceCompletedAt: string | null } | undefined;
    if (!period) return reply.code(404).send({ error: "Period not found" });
    if (period.status !== "live") return reply.code(409).send({ error: "Only a class day in progress can be finished" });
    const hasAttendance = Boolean(db.prepare("SELECT 1 FROM attendance WHERE periodId = ? AND classId = ? AND teacherId = ? LIMIT 1").get(periodId, classId, teacherId));
    if (hasAttendance && !period.attendanceCompletedAt && body.confirmAttendanceIncomplete !== true)
      return reply.code(409).send({ error: "Attendance is not marked complete", code: "ATTENDANCE_INCOMPLETE" });
    db.transaction(() => {
      db.prepare("UPDATE periods SET status = 'closed', active = 0, scheduled = 0, endedAt = ? WHERE id = ? AND classId = ? AND teacherId = ? AND status = 'live'").run(timestamp, periodId, classId, teacherId);
      db.prepare("UPDATE class_timers SET status = 'stopped', endsAt = NULL, remainingSeconds = 0, revision = revision + 1, updatedAt = ? WHERE teacherId = ? AND classId = ? AND periodId = ? AND status IN ('running', 'paused')").run(timestamp, teacherId, classId, periodId);
    })();
    const stoppedTimer = timerState(db, teacherId, classId); if (stoppedTimer) notifyTimer(app, stoppedTimer);
    notify(app, classId, "period");
    refreshStudents(app, classId, "class-day");
    return { id: periodId, classId, status: "closed", active: false, scheduled: false, endedAt: timestamp };
  });

  app.post("/api/classes/:classId/periods/:periodId/reopen", auth, async (request, reply) => {
    const { classId, periodId } = params(request); const teacherId = (request as TeacherRequest).teacherId; const timestamp = now();
    const period = db.prepare("SELECT status FROM periods WHERE id = ? AND classId = ? AND teacherId = ?").get(periodId, classId, teacherId) as { status: PeriodStatus } | undefined;
    if (!period) return reply.code(404).send({ error: "Period not found" });
    if (period.status !== "closed") return reply.code(409).send({ error: "Only a closed class day can be reopened" });
    db.transaction(() => {
      closeLivePeriod(db, teacherId, classId, timestamp, periodId);
      db.prepare("UPDATE periods SET status = 'live', active = 1, scheduled = 0, endedAt = NULL, reopenedAt = ? WHERE id = ? AND classId = ? AND teacherId = ? AND status = 'closed'").run(timestamp, periodId, classId, teacherId);
    })();
    notify(app, classId, "period");
    refreshStudents(app, classId, "class-day");
    return { id: periodId, classId, status: "live", active: true, scheduled: false, endedAt: null, reopenedAt: timestamp };
  });

  app.patch("/api/classes/:classId/periods/:periodId", auth, async (request, reply) => {
    try {
      const { classId, periodId } = params(request); const teacherId = (request as TeacherRequest).teacherId; const body = object(request.body);
      const period = db.prepare("SELECT label, status, active, scheduled, endedAt, attendanceCompletedAt, reopenedAt, type, participationExpected, teacherNote FROM periods WHERE id = ? AND classId = ? AND teacherId = ?").get(periodId, classId, teacherId) as Record<string, unknown> | undefined;
      if (!period) return reply.code(404).send({ error: "Period not found" });
      if (body.active !== undefined || body.scheduled !== undefined || body.status !== undefined) return reply.code(409).send({ error: "Use the start, finish, or reopen action to change class-day status" });
      const label = body.label === undefined ? period.label : text(body.label, "Period label", 100);
      const type = body.type === undefined ? period.type : oneOf(body.type, ["instructional", "independent", "assessment", "no-participation"] as const, "Period type");
      const expected = body.participationExpected === undefined ? Boolean(period.participationExpected) : boolean(body.participationExpected, "Participation expected");
      const nullableText = (value: unknown, old: unknown, name: string, max: number) => value === undefined ? old : value === null || value === "" ? null : text(value, name, max);
      const teacherNote = nullableText(body.teacherNote, period.teacherNote, "Teacher note", 500);
      db.prepare("UPDATE periods SET label = ?, type = ?, participationExpected = ?, teacherNote = ? WHERE id = ? AND classId = ? AND teacherId = ?").run(label, type, Number(expected), teacherNote, periodId, classId, teacherId);
      notify(app, classId, "period"); return { id: periodId, label, status: period.status, active: Boolean(period.active), scheduled: Boolean(period.scheduled), endedAt: period.endedAt, attendanceCompletedAt: period.attendanceCompletedAt, reopenedAt: period.reopenedAt, type, participationExpected: expected, teacherNote };
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.delete("/api/classes/:classId/periods/:periodId", auth, async (request, reply) => {
    const { classId, periodId } = params(request); const teacherId = (request as TeacherRequest).teacherId;
    const period = db.prepare("SELECT active FROM periods WHERE id = ? AND classId = ? AND teacherId = ?").get(periodId, classId, teacherId) as { active: number } | undefined;
    if (!period) return reply.code(404).send({ error: "Period not found" });
    if (period.active) return reply.code(409).send({ error: "Finish the class day before deleting it" });
    const used = db.prepare("SELECT 1 FROM events WHERE periodId = ? AND classId = ? AND teacherId = ? UNION ALL SELECT 1 FROM attendance WHERE periodId = ? AND classId = ? AND teacherId = ? AND status != 'present' UNION ALL SELECT 1 FROM mastery_events WHERE periodId = ? AND classId = ? AND teacherId = ? UNION ALL SELECT 1 FROM skill_evidence_photos WHERE periodId = ? AND classId = ? AND teacherId = ? LIMIT 1").get(periodId, classId, teacherId, periodId, classId, teacherId, periodId, classId, teacherId, periodId, classId, teacherId);
    if (used) return reply.code(409).send({ error: "Only empty class days can be deleted; merge this class day instead" });
    const result = db.transaction(() => {
      db.prepare("DELETE FROM events WHERE periodId = ? AND classId = ? AND teacherId = ?").run(periodId, classId, teacherId);
      db.prepare("DELETE FROM attendance WHERE periodId = ? AND classId = ? AND teacherId = ?").run(periodId, classId, teacherId);
      return db.prepare("DELETE FROM periods WHERE id = ? AND classId = ? AND teacherId = ?").run(periodId, classId, teacherId);
    })();
    if (!result.changes) return reply.code(404).send({ error: "Period not found" }); notify(app, classId, "period"); return reply.code(204).send();
  });

  app.post("/api/classes/:classId/periods/:periodId/merge", auth, async (request, reply) => {
    try {
      const { classId, periodId } = params(request); const teacherId = (request as TeacherRequest).teacherId;
      const targetPeriodId = text(object(request.body).targetPeriodId, "Target period ID");
      if (targetPeriodId === periodId) return reply.code(400).send({ error: "Source and target class days must differ" });
      const owned = db.prepare("SELECT COUNT(*) count FROM periods WHERE id IN (?, ?) AND classId = ? AND teacherId = ?").get(periodId, targetPeriodId, classId, teacherId) as { count: number };
      if (owned.count !== 2) return reply.code(404).send({ error: "Source or target class day not found" });
      const source = db.prepare("SELECT active, scheduled FROM periods WHERE id = ? AND classId = ? AND teacherId = ?").get(periodId, classId, teacherId) as { active: number; scheduled: number } | undefined;
      if (source?.active) return reply.code(409).send({ error: "Finish the source class day before merging it" });
      const target = db.prepare("SELECT scheduled FROM periods WHERE id = ? AND classId = ? AND teacherId = ?").get(targetPeriodId, classId, teacherId) as { scheduled: number };
      const sourceUsed = db.prepare("SELECT 1 FROM events WHERE periodId = ? AND classId = ? AND teacherId = ? UNION ALL SELECT 1 FROM attendance WHERE periodId = ? AND classId = ? AND teacherId = ? LIMIT 1").get(periodId, classId, teacherId, periodId, classId, teacherId);
      if (target.scheduled && sourceUsed) return reply.code(409).send({ error: "Completed class data cannot be merged into a scheduled class day" });
      const conflict = db.prepare("SELECT 1 FROM attendance s JOIN attendance t ON t.periodId = ? AND t.studentId = s.studentId AND t.classId = s.classId AND t.teacherId = s.teacherId WHERE s.periodId = ? AND s.classId = ? AND s.teacherId = ? AND s.status != t.status LIMIT 1").get(targetPeriodId, periodId, classId, teacherId);
      if (conflict) return reply.code(409).send({ error: "Attendance conflicts must be corrected before merging" });
      db.transaction(() => {
        db.prepare("DELETE FROM attendance WHERE periodId = ? AND classId = ? AND teacherId = ? AND studentId IN (SELECT studentId FROM attendance WHERE periodId = ? AND classId = ? AND teacherId = ?)").run(periodId, classId, teacherId, targetPeriodId, classId, teacherId);
        db.prepare("UPDATE attendance SET periodId = ? WHERE periodId = ? AND classId = ? AND teacherId = ?").run(targetPeriodId, periodId, classId, teacherId);
        db.prepare("UPDATE events SET periodId = ? WHERE periodId = ? AND classId = ? AND teacherId = ?").run(targetPeriodId, periodId, classId, teacherId);
        db.prepare("UPDATE mastery_events SET periodId = ? WHERE periodId = ? AND classId = ? AND teacherId = ?").run(targetPeriodId, periodId, classId, teacherId);
        db.prepare("UPDATE skill_evidence_photos SET periodId = ? WHERE periodId = ? AND classId = ? AND teacherId = ?").run(targetPeriodId, periodId, classId, teacherId);
        db.prepare("DELETE FROM periods WHERE id = ? AND classId = ? AND teacherId = ?").run(periodId, classId, teacherId);
      })();
      notify(app, classId, "period"); return { sourcePeriodId: periodId, targetPeriodId };
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.put("/api/classes/:classId/attendance/:studentId", auth, async (request, reply) => {
    try {
      const { classId, studentId } = params(request);
      const teacherId = (request as TeacherRequest).teacherId;
      const body = object(request.body);
      const periodId = optionalText(body.periodId, "Period ID") ?? activePeriod(db, teacherId, classId)?.id;
      if (!periodId) return reply.code(409).send({ error: "No class day is in progress" });
      const period = db.prepare("SELECT status FROM periods WHERE id = ? AND classId = ? AND teacherId = ?").get(periodId, classId, teacherId) as { status: PeriodStatus } | undefined;
      if (!period) return reply.code(404).send({ error: "Period not found" });
      if (period.status !== "live") return reply.code(409).send({ error: "Reopen the class day before correcting attendance" });
      const valid = db.prepare("SELECT 1 FROM students s JOIN periods p ON p.id = ? AND p.teacherId = s.teacherId AND p.classId = s.classId AND p.status = 'live' WHERE s.id = ? AND s.classId = ? AND s.teacherId = ?").get(periodId, studentId, classId, teacherId);
      if (!valid) return reply.code(404).send({ error: "Student or class day not found" });
      const status = oneOf(body.status, ["present", "absent"] as const, "Attendance status");
      db.prepare("INSERT INTO attendance (teacherId, classId, periodId, studentId, status) VALUES (?, ?, ?, ?, ?) ON CONFLICT(periodId, studentId) DO UPDATE SET status = excluded.status WHERE teacherId = excluded.teacherId AND classId = excluded.classId")
        .run(teacherId, classId, periodId, studentId, status);
      notify(app, classId);
      refreshStudents(app, classId, "attendance", [studentId]);
      return { periodId, studentId, status };
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.put("/api/classes/:classId/periods/:periodId/attendance", auth, async (request, reply) => {
    try {
      const { classId, periodId } = params(request); const teacherId = (request as TeacherRequest).teacherId; const body = object(request.body);
      const period = db.prepare("SELECT status FROM periods WHERE id = ? AND classId = ? AND teacherId = ?").get(periodId, classId, teacherId) as { status: PeriodStatus } | undefined;
      if (!period) return reply.code(404).send({ error: "Period not found" });
      if (period.status !== "live") return reply.code(409).send({ error: "Reopen the class day before correcting attendance" });
      const status = oneOf(body.status, ["present", "absent"] as const, "Attendance status");
      let studentIds: string[] | undefined;
      if (body.studentIds !== undefined) {
        if (!Array.isArray(body.studentIds) || body.studentIds.some((studentId) => typeof studentId !== "string")) throw new Error("studentIds must be an array of IDs");
        studentIds = [...new Set(body.studentIds as string[])];
        const enrolledIds = new Set((db.prepare("SELECT studentId FROM attendance WHERE periodId = ? AND classId = ? AND teacherId = ?").all(periodId, classId, teacherId) as { studentId: string }[]).map((row) => row.studentId));
        if (studentIds.some((studentId) => !enrolledIds.has(studentId))) return reply.code(404).send({ error: "Student not found in class-day attendance" });
      }
      const updated = db.transaction(() => {
        if (studentIds === undefined) return db.prepare("UPDATE attendance SET status = ? WHERE periodId = ? AND classId = ? AND teacherId = ?").run(status, periodId, classId, teacherId).changes;
        const update = db.prepare("UPDATE attendance SET status = ? WHERE periodId = ? AND studentId = ? AND classId = ? AND teacherId = ?");
        return studentIds.reduce((count, studentId) => count + update.run(status, periodId, studentId, classId, teacherId).changes, 0);
      })();
      const affected = studentIds ?? (db.prepare("SELECT studentId FROM attendance WHERE periodId = ? AND classId = ? AND teacherId = ?").all(periodId, classId, teacherId) as { studentId: string }[]).map((row) => row.studentId);
      notify(app, classId); refreshStudents(app, classId, "attendance", affected); return { periodId, status, studentIds: studentIds ?? null, updated };
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.post("/api/classes/:classId/periods/:periodId/attendance/complete", auth, async (request, reply) => {
    const { classId, periodId } = params(request); const teacherId = (request as TeacherRequest).teacherId; const timestamp = now();
    const period = db.prepare("SELECT status FROM periods WHERE id = ? AND classId = ? AND teacherId = ?").get(periodId, classId, teacherId) as { status: PeriodStatus } | undefined;
    if (!period) return reply.code(404).send({ error: "Period not found" });
    if (period.status !== "live") return reply.code(409).send({ error: "Reopen the class day before completing attendance" });
    db.prepare("UPDATE periods SET attendanceCompletedAt = ? WHERE id = ? AND classId = ? AND teacherId = ? AND status = 'live'").run(timestamp, periodId, classId, teacherId);
    notify(app, classId, "period"); return { periodId, attendanceCompletedAt: timestamp };
  });

  app.post("/api/classes/:classId/events", auth, async (request, reply) => {
    try {
      const { classId } = params(request);
      const teacherId = (request as TeacherRequest).teacherId;
      const body = object(request.body);
      const studentId = text(body.studentId, "Student ID");
      const periodId = optionalText(body.periodId, "Period ID") ?? activePeriod(db, teacherId, classId)?.id;
      if (!periodId) return reply.code(409).send({ error: "No class day is in progress" });
      const period = db.prepare("SELECT status FROM periods WHERE id = ? AND classId = ? AND teacherId = ?").get(periodId, classId, teacherId) as { status: PeriodStatus } | undefined;
      if (!period) return reply.code(404).send({ error: "Period not found" });
      if (period.status !== "live") return reply.code(409).send({ error: "Participation can only be recorded during a class day in progress" });
      const valid = db.prepare("SELECT 1 FROM students s JOIN periods p ON p.id = ? AND p.teacherId = s.teacherId AND p.classId = s.classId AND p.status = 'live' WHERE s.id = ? AND s.classId = ? AND s.teacherId = ?").get(periodId, studentId, classId, teacherId);
      if (!valid) return reply.code(404).send({ error: "Student or class day not found" });
      const type = oneOf(body.type, ["part+", "part-"] as const, "Event type");
      const event = { id: id(), classId, studentId, periodId, type, timestamp: now() };
      db.prepare("INSERT INTO events (id, teacherId, classId, studentId, periodId, type, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)").run(event.id, teacherId, classId, studentId, periodId, type, event.timestamp);
      notify(app, classId);
      return reply.code(201).send(event);
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.delete("/api/classes/:classId/events/:eventId", auth, async (request, reply) => {
    const { classId, eventId } = params(request);
    const result = db.prepare("DELETE FROM events WHERE id = ? AND classId = ? AND teacherId = ? AND type IN ('part+', 'part-')").run(eventId, classId, (request as TeacherRequest).teacherId);
    if (!result.changes) return reply.code(404).send({ error: "Event not found" });
    notify(app, classId);
    return reply.code(204).send();
  });

  app.delete("/api/classes/:classId/events/last/:studentId", auth, async (request, reply) => {
    const { classId, studentId } = params(request); const teacherId = (request as TeacherRequest).teacherId;
    const event = db.prepare("SELECT e.id FROM events e JOIN periods p ON p.id = e.periodId WHERE e.classId = ? AND e.teacherId = ? AND e.studentId = ? AND p.status = 'live' AND e.type IN ('part+', 'part-') ORDER BY e.timestamp DESC, e.rowid DESC LIMIT 1").get(classId, teacherId, studentId) as { id: string } | undefined;
    if (!event) return reply.code(404).send({ error: "Participation event not found" });
    db.prepare("DELETE FROM events WHERE id = ? AND classId = ? AND teacherId = ?").run(event.id, classId, teacherId); notify(app, classId); return reply.code(204).send();
  });

  registerSkills(app, db, photoDir, auth);
  registerSettingsAndRequests(app, db, auth);
}

function registerSkills(app: FastifyInstance, db: AppDatabase, photoDir: string, auth: { preHandler: (request: FastifyRequest, reply: FastifyReply) => Promise<void> }) {
  app.post("/api/classes/:classId/skills", auth, async (request, reply) => {
    try {
      const { classId } = params(request); const teacherId = (request as TeacherRequest).teacherId; const body = object(request.body);
      if (!ownedClass(db, teacherId, classId)) return reply.code(404).send({ error: "Class not found" });
      const skillId = id();
      const parentSkillId = optionalText(body.parentSkillId, "Parent skill ID");
      if (parentSkillId && !db.prepare("SELECT 1 FROM skills WHERE id = ? AND classId = ? AND teacherId = ? AND parentSkillId IS NULL").get(parentSkillId, classId, teacherId)) return reply.code(404).send({ error: "Parent skill not found" });
      const order = (db.prepare("SELECT COALESCE(MAX(sortOrder), -1) + 1 AS value FROM skills WHERE classId = ? AND teacherId = ?").get(classId, teacherId) as { value: number }).value;
      db.prepare("INSERT INTO skills (id, teacherId, classId, label, category, sortOrder, visibleToStudents, parentSkillId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(skillId, teacherId, classId, text(body.label, "Skill label"), optionalText(body.category, "Category") ?? "", order, Number(body.visibleToStudents === true), parentSkillId ?? null);
      notify(app, classId); return reply.code(201).send({ id: skillId, classId, label: body.label, category: body.category ?? "", order, visibleToStudents: body.visibleToStudents === true, parentSkillId: parentSkillId ?? null });
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.patch("/api/classes/:classId/skills/:skillId", auth, async (request, reply) => {
    try {
      const { classId, skillId } = params(request); const teacherId = (request as TeacherRequest).teacherId; const body = object(request.body);
      const row = db.prepare("SELECT * FROM skills WHERE id = ? AND classId = ? AND teacherId = ?").get(skillId, classId, teacherId) as Record<string, unknown> | undefined;
      if (!row) return reply.code(404).send({ error: "Skill not found" });
      const category = body.category === undefined ? row.category : text(body.category, "Category");
      db.transaction(() => {
        db.prepare("UPDATE skills SET label = ?, category = ?, visibleToStudents = ? WHERE id = ? AND classId = ? AND teacherId = ?").run(body.label === undefined ? row.label : text(body.label, "Skill label"), category, body.visibleToStudents === undefined ? row.visibleToStudents : Number(boolean(body.visibleToStudents, "Visibility")), skillId, classId, teacherId);
        if (!row.parentSkillId && body.category !== undefined) db.prepare("UPDATE skills SET category = ? WHERE parentSkillId = ? AND classId = ? AND teacherId = ?").run(category, skillId, classId, teacherId);
      })();
      notify(app, classId); return { ok: true };
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.put("/api/classes/:classId/skills/visibility", auth, async (request, reply) => {
    try {
      const { classId } = params(request); const teacherId = (request as TeacherRequest).teacherId; const body = object(request.body);
      if (!ownedClass(db, teacherId, classId)) return reply.code(404).send({ error: "Class not found" });
      const visible = boolean(body.visibleToStudents, "Visibility");
      const category = body.category === undefined ? undefined : text(body.category, "Category");
      const result = db.transaction(() => category === undefined
        ? db.prepare("UPDATE skills SET visibleToStudents = ? WHERE classId = ? AND teacherId = ?").run(Number(visible), classId, teacherId)
        : db.prepare("UPDATE skills SET visibleToStudents = ? WHERE classId = ? AND teacherId = ? AND category = ?").run(Number(visible), classId, teacherId, category))();
      notify(app, classId); return { updated: result.changes, visibleToStudents: visible, category: category ?? null };
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.delete("/api/classes/:classId/skills/:skillId", auth, async (request, reply) => {
    const { classId, skillId } = params(request); const teacherId = (request as TeacherRequest).teacherId;
    const childIds = (db.prepare("SELECT id FROM skills WHERE parentSkillId = ? AND classId = ? AND teacherId = ?").all(skillId, classId, teacherId) as { id: string }[]).map((row) => row.id);
    const skillIds = [skillId, ...childIds];
    const placeholders = skillIds.map(() => "?").join(",");
    const files = (db.prepare(`SELECT storageKey FROM skill_evidence_photos WHERE skillId IN (${placeholders}) AND classId = ? AND teacherId = ?`).all(...skillIds, classId, teacherId) as { storageKey: string }[]).map((photo) => photo.storageKey);
    const result = db.transaction(() => { for (const id of skillIds) { db.prepare("DELETE FROM skill_evidence_photos WHERE skillId = ? AND classId = ? AND teacherId = ?").run(id, classId, teacherId); db.prepare("DELETE FROM mastery WHERE skillId = ? AND classId = ? AND teacherId = ?").run(id, classId, teacherId); } db.prepare("DELETE FROM skills WHERE parentSkillId = ? AND classId = ? AND teacherId = ?").run(skillId, classId, teacherId); return db.prepare("DELETE FROM skills WHERE id = ? AND classId = ? AND teacherId = ?").run(skillId, classId, teacherId); })();
    if (result.changes) await deletePhotoFiles(photoDir, files);
    if (!result.changes) return reply.code(404).send({ error: "Skill not found" }); notify(app, classId); return reply.code(204).send();
  });

  app.put("/api/classes/:classId/skills/reorder", auth, async (request, reply) => {
    const { classId } = params(request); const teacherId = (request as TeacherRequest).teacherId; const body = object(request.body);
    if (!Array.isArray(body.skillIds)) return reply.code(400).send({ error: "skillIds must be an array" });
    const owned = db.prepare("SELECT id FROM skills WHERE classId = ? AND teacherId = ?").all(classId, teacherId) as { id: string }[];
    const ids = body.skillIds.filter((item): item is string => typeof item === "string");
    if (ids.length !== owned.length || new Set(ids).size !== ids.length || ids.some((skillId) => !owned.some((row) => row.id === skillId))) return reply.code(400).send({ error: "Order must include every class skill once" });
    db.transaction(() => ids.forEach((skillId, order) => db.prepare("UPDATE skills SET sortOrder = ? WHERE id = ? AND classId = ? AND teacherId = ?").run(order, skillId, classId, teacherId)))();
    notify(app, classId); return { ok: true };
  });

  app.post("/api/classes/:classId/skills/clone", auth, async (request, reply) => {
    try {
      const { classId } = params(request); const teacherId = (request as TeacherRequest).teacherId; const body = object(request.body); const sourceClassId = text(body.sourceClassId, "Source class ID");
      const mode = body.mode === undefined ? "merge" : oneOf(body.mode, ["merge", "replace"] as const, "Clone mode");
      if (!ownedClass(db, teacherId, classId) || !ownedClass(db, teacherId, sourceClassId)) return reply.code(404).send({ error: "Class not found" });
      const source = db.prepare("SELECT id, label, category, visibleToStudents, parentSkillId FROM skills WHERE classId = ? AND teacherId = ? ORDER BY sortOrder").all(sourceClassId, teacherId) as Record<string, unknown>[];
      const existing = db.prepare("SELECT id, label, category, parentSkillId FROM skills WHERE classId = ? AND teacherId = ? ORDER BY sortOrder").all(classId, teacherId) as Record<string, unknown>[];
      const replacedPhotoFiles = mode === "replace" ? (db.prepare("SELECT storageKey FROM skill_evidence_photos WHERE classId = ? AND teacherId = ?").all(classId, teacherId) as { storageKey: string }[]).map((photo) => photo.storageKey) : [];
      let created = 0; let skipped = 0; let removed = 0;
      db.transaction(() => {
        if (mode === "replace") {
          removed = existing.length;
          db.prepare("DELETE FROM mastery WHERE classId = ? AND teacherId = ?").run(classId, teacherId);
          db.prepare("DELETE FROM skills WHERE classId = ? AND teacherId = ?").run(classId, teacherId);
        }
        const mapped = new Map<string, string>();
        const roots = new Map<string, string>();
        for (const skill of source.filter((item) => !item.parentSkillId)) {
          const family = `${normalizedSkill(skill.category)}\u0000${normalizedSkill(skill.label)}`;
          const duplicate = mode === "merge" ? existing.find((item) => !item.parentSkillId && `${normalizedSkill(item.category)}\u0000${normalizedSkill(item.label)}` === family) : undefined;
          mapped.set(String(skill.id), duplicate ? String(duplicate.id) : id()); roots.set(String(skill.id), family); if (duplicate) skipped++; else created++;
        }
        for (const skill of source.filter((item) => item.parentSkillId)) {
          const family = roots.get(String(skill.parentSkillId)) ?? "";
          const duplicate = mode === "merge" ? existing.find((item) => item.parentSkillId && `${normalizedSkill(item.category)}\u0000${normalizedSkill(item.label)}\u0000${family}` === `${normalizedSkill(skill.category)}\u0000${normalizedSkill(skill.label)}\u0000${family}` && item.parentSkillId === mapped.get(String(skill.parentSkillId))) : undefined;
          mapped.set(String(skill.id), duplicate ? String(duplicate.id) : id()); if (duplicate) skipped++; else created++;
        }
        const start = mode === "replace" ? 0 : (db.prepare("SELECT COALESCE(MAX(sortOrder), -1) + 1 value FROM skills WHERE classId = ? AND teacherId = ?").get(classId, teacherId) as { value: number }).value;
        source.forEach((skill, index) => { if (!existing.some((item) => item.id === mapped.get(String(skill.id)))) db.prepare("INSERT INTO skills (id, teacherId, classId, label, category, sortOrder, visibleToStudents, parentSkillId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(mapped.get(String(skill.id)), teacherId, classId, skill.label, skill.category, start + index, skill.visibleToStudents, skill.parentSkillId ? mapped.get(String(skill.parentSkillId)) : null); });
      })();
      if (replacedPhotoFiles.length) await deletePhotoFiles(photoDir, replacedPhotoFiles);
      notify(app, classId); return reply.code(201).send({ mode, created, skipped, removed });
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  app.put("/api/classes/:classId/mastery/:studentId/:skillId", auth, async (request, reply) => {
    try {
      const { classId, studentId, skillId } = params(request); const teacherId = (request as TeacherRequest).teacherId; const body = object(request.body ?? {});
      const skill = db.prepare("SELECT id, label, category, parentSkillId FROM skills WHERE id = ? AND classId = ? AND teacherId = ? AND EXISTS (SELECT 1 FROM students WHERE id = ? AND classId = ? AND teacherId = ?)").get(skillId, classId, teacherId, studentId, classId, teacherId) as Record<string, unknown> | undefined;
      if (!skill) return reply.code(404).send({ error: "Student or skill not found" });
      if (db.prepare("SELECT 1 FROM skills WHERE parentSkillId = ? AND classId = ? AND teacherId = ? LIMIT 1").get(skillId, classId, teacherId)) return reply.code(409).send({ error: "Parent mastery is calculated from its subskills" });
      const current = db.prepare("SELECT achievement, requiresSupport FROM mastery WHERE studentId = ? AND skillId = ? AND classId = ? AND teacherId = ?").get(studentId, skillId, classId, teacherId) as { achievement: string; requiresSupport: number } | undefined;
      if (body.achievement === undefined && body.requiresSupport === undefined) throw new Error("Achievement or support must be provided");
      const achievement = body.achievement === undefined ? current?.achievement ?? "not_started" : oneOf(body.achievement, achievementLevels, "Achievement");
      const requiresSupport = body.requiresSupport === undefined ? Boolean(current?.requiresSupport) : boolean(body.requiresSupport, "Requires support");
      let timestamp = now();
      if (body.assessedAt !== undefined) {
        if (typeof body.assessedAt !== "string" || Number.isNaN(Date.parse(body.assessedAt))) throw new Error("Assessed at must be a valid timestamp");
        timestamp = new Date(body.assessedAt).toISOString();
        if (Date.parse(timestamp) > Date.now() + 5 * 60_000 || Date.parse(timestamp) < Date.UTC(2000, 0, 1)) throw new Error("Assessed at is outside the allowed range");
      }
      const requestedPeriodId = optionalText(body.periodId, "Period ID");
      const period = requestedPeriodId
        ? db.prepare("SELECT id, status FROM periods WHERE id = ? AND classId = ? AND teacherId = ?").get(requestedPeriodId, classId, teacherId) as { id: string; status: PeriodStatus } | undefined
        : db.prepare("SELECT id, status FROM periods WHERE classId = ? AND teacherId = ? AND status = 'live' ORDER BY startedAt DESC LIMIT 1").get(classId, teacherId) as { id: string; status: PeriodStatus } | undefined;
      if (requestedPeriodId && !period) return reply.code(404).send({ error: "Period not found" });
      if (!period || period.status !== "live") return reply.code(409).send({ error: "Achievement can only be updated during a class day in progress; reopen a closed class day first" });
      const skills = db.prepare("SELECT id, label, category, parentSkillId FROM skills WHERE classId = ? AND teacherId = ?").all(classId, teacherId) as Record<string, unknown>[];
      const beforeRows = db.prepare("SELECT studentId, skillId, achievement, requiresSupport FROM mastery WHERE classId = ? AND teacherId = ? AND studentId = ?").all(classId, teacherId, studentId) as Record<string, unknown>[];
      const parent = skill.parentSkillId ? skills.find((item) => item.id === skill.parentSkillId) : undefined;
      let parentCounts = parent ? parentSummary(skills, beforeRows, studentId, parent.id) : null;
      if (achievement !== (current?.achievement ?? "not_started") || requiresSupport !== Boolean(current?.requiresSupport)) db.transaction(() => {
        db.prepare("INSERT INTO mastery (teacherId, classId, studentId, skillId, achievement, requiresSupport, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(studentId, skillId) DO UPDATE SET achievement = excluded.achievement, requiresSupport = excluded.requiresSupport, updatedAt = excluded.updatedAt WHERE teacherId = excluded.teacherId AND classId = excluded.classId").run(teacherId, classId, studentId, skillId, achievement, Number(requiresSupport), timestamp);
        db.prepare("INSERT INTO mastery_events (id, teacherId, classId, studentId, skillId, previousAchievement, achievement, previousRequiresSupport, requiresSupport, timestamp, periodId, skillLabel, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id(), teacherId, classId, studentId, skillId, current?.achievement ?? "not_started", achievement, Number(Boolean(current?.requiresSupport)), Number(requiresSupport), timestamp, period?.id ?? null, skill.label, skill.category);
        const afterRows = beforeRows.filter((item) => item.skillId !== skillId).concat({ studentId, skillId, achievement, requiresSupport });
        parentCounts = parent ? parentSummary(skills, afterRows, studentId, parent.id) : null;
      })();
      notify(app, classId); refreshStudents(app, classId, "mastery", [studentId]); return { studentId, skillId, achievement, requiresSupport, assessedAt: timestamp, periodId: period?.id ?? null, parentSummary: parentCounts };
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });
}

function registerSettingsAndRequests(app: FastifyInstance, db: AppDatabase, auth: { preHandler: (request: FastifyRequest, reply: FastifyReply) => Promise<void> }) {
  app.put("/api/classes/:classId/settings", auth, async (request, reply) => {
    try {
      const { classId } = params(request); const teacherId = (request as TeacherRequest).teacherId; const body = object(request.body);
      const row = db.prepare("SELECT settings FROM classes WHERE id = ? AND teacherId = ?").get(classId, teacherId) as { settings: string } | undefined;
      if (!row) return reply.code(404).send({ error: "Class not found" });
      const old = JSON.parse(row.settings) as Record<string, unknown>; const next = classSettings(old);
      if (body.archived !== undefined) next.archived = boolean(body.archived, "archived");
      if (body.layout !== undefined) next.layout = oneOf(body.layout, ["grid", "map"] as const, "Layout");
      if (body.participationWatchAfter !== undefined) next.participationWatchAfter = participationThreshold(body.participationWatchAfter, "Watch threshold");
      if (body.participationCheckInAfter !== undefined) next.participationCheckInAfter = participationThreshold(body.participationCheckInAfter, "Check-in threshold");
      validateParticipationThresholds(next);
      db.prepare("UPDATE classes SET settings = ? WHERE id = ? AND teacherId = ?").run(JSON.stringify(next), classId, teacherId); notify(app, classId); refreshStudents(app, classId, "settings"); return next;
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  for (const resource of ["request-types", "tags"] as const) {
    const table = resource === "request-types" ? "request_types" : "tags";
    app.post(`/api/classes/:classId/${resource}`, auth, async (request, reply) => {
      try {
        const { classId } = params(request); const teacherId = (request as TeacherRequest).teacherId; const body = object(request.body);
        if (!ownedClass(db, teacherId, classId)) return reply.code(404).send({ error: "Class not found" }); const itemId = id(); const label = text(body.label, "Label", 80);
        if (table === "request_types") {
          const behavior = body.behavior === undefined ? "custom" : oneOf(body.behavior, ["attention", "presence", "completion", "custom"] as const, "Behavior");
          const resolveLabel = optionalText(body.resolveLabel, "Resolve label", 80) ?? "Resolve";
          db.prepare("INSERT INTO request_types (id, teacherId, classId, label, color, isAttentionLane, behavior, resolveLabel) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(itemId, teacherId, classId, label, optionalText(body.color, "Color", 30) ?? "#4f766f", Number(behavior === "attention"), behavior, resolveLabel);
        }
        else db.prepare("INSERT INTO tags (id, teacherId, classId, label) VALUES (?, ?, ?, ?)").run(itemId, teacherId, classId, label);
        notify(app, classId); if (table === "request_types") refreshStudents(app, classId, "request-types"); return reply.code(201).send(table === "request_types" ? db.prepare("SELECT id, classId, label, color, behavior, resolveLabel FROM request_types WHERE id = ?").get(itemId) : { id: itemId, classId, label });
      } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
    });
    app.delete(`/api/classes/:classId/${resource}/:itemId`, auth, async (request, reply) => {
      const { classId, itemId } = params(request); const teacherId = (request as TeacherRequest).teacherId;
      if (table === "request_types" && db.prepare("SELECT 1 FROM requests WHERE requestTypeId = ? AND classId = ? AND teacherId = ? LIMIT 1").get(itemId, classId, teacherId)) return reply.code(409).send({ error: "Request types with history cannot be deleted" });
      const result = db.prepare(`DELETE FROM ${table} WHERE id = ? AND classId = ? AND teacherId = ?`).run(itemId, classId, teacherId);
      if (!result.changes) return reply.code(404).send({ error: "Item not found" }); notify(app, classId); if (table === "request_types") refreshStudents(app, classId, "request-types"); return reply.code(204).send();
    });
    app.patch(`/api/classes/:classId/${resource}/:itemId`, auth, async (request, reply) => {
      try {
        const { classId, itemId } = params(request); const teacherId = (request as TeacherRequest).teacherId; const body = object(request.body);
        const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND classId = ? AND teacherId = ?`).get(itemId, classId, teacherId) as Record<string, unknown> | undefined;
        if (!row) return reply.code(404).send({ error: "Item not found" });
        const label = body.label === undefined ? row.label : text(body.label, "Label", 80);
        if (table === "request_types") {
          const behavior = body.behavior === undefined ? String(row.behavior) : oneOf(body.behavior, ["attention", "presence", "completion", "custom"] as const, "Behavior");
          const resolveLabel = body.resolveLabel === undefined ? String(row.resolveLabel) : text(body.resolveLabel, "Resolve label", 80);
          db.prepare("UPDATE request_types SET label = ?, color = ?, isAttentionLane = ?, behavior = ?, resolveLabel = ? WHERE id = ? AND classId = ? AND teacherId = ?").run(label, body.color === undefined ? row.color : text(body.color, "Color", 30), Number(behavior === "attention"), behavior, resolveLabel, itemId, classId, teacherId);
        }
        else db.prepare("UPDATE tags SET label = ? WHERE id = ? AND classId = ? AND teacherId = ?").run(label, itemId, classId, teacherId);
        notify(app, classId); if (table === "request_types") refreshStudents(app, classId, "request-types"); return table === "request_types" ? db.prepare("SELECT id, classId, label, color, behavior, resolveLabel FROM request_types WHERE id = ?").get(itemId) : { id: itemId, label };
      } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
    });
  }

  app.put("/api/classes/:classId/requests/:studentId/:requestTypeId", auth, async (request, reply) => {
    const { classId, studentId, requestTypeId } = params(request); const teacherId = (request as TeacherRequest).teacherId;
    const valid = db.prepare("SELECT 1 FROM students s JOIN request_types r ON r.id = ? AND r.classId = s.classId AND r.teacherId = s.teacherId WHERE s.id = ? AND s.classId = ? AND s.teacherId = ?").get(requestTypeId, studentId, classId, teacherId);
    if (!valid) return reply.code(404).send({ error: "Student or request type not found" });
    const timestamp = now(); const requestId = id();
    const existing = db.prepare("SELECT id FROM requests WHERE teacherId = ? AND classId = ? AND studentId = ? AND status IN ('active', 'acknowledged')").get(teacherId, classId, studentId) as { id: string } | undefined;
    if (existing) return reply.code(409).send({ error: "Student already has an active request", requestId: existing.id });
    db.prepare("INSERT INTO requests (id, teacherId, classId, studentId, requestTypeId, status, joinedAt, updatedAt) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)").run(requestId, teacherId, classId, studentId, requestTypeId, timestamp, timestamp);
    notifyRequest(app, classId, requestId, studentId); return { id: requestId, studentId, requestTypeId, status: "active", joinedAt: timestamp, updatedAt: timestamp };
  });

  app.delete("/api/classes/:classId/requests/:studentId/:requestTypeId", auth, async (request, reply) => {
    const { classId, studentId, requestTypeId } = params(request); const teacherId = (request as TeacherRequest).teacherId;
    const row = db.prepare("SELECT id FROM requests WHERE studentId = ? AND requestTypeId = ? AND classId = ? AND teacherId = ? AND status IN ('active', 'acknowledged') ORDER BY joinedAt LIMIT 1").get(studentId, requestTypeId, classId, teacherId) as { id: string } | undefined;
    if (!row) return reply.code(404).send({ error: "Request not found" });
    const timestamp = now(); db.prepare("UPDATE requests SET status = 'resolved', resolvedAt = ?, resolvedBy = ?, updatedAt = ? WHERE id = ?").run(timestamp, teacherId, timestamp, row.id);
    notifyRequest(app, classId, row.id, studentId); return reply.code(204).send();
  });

  app.post("/api/classes/:classId/requests/next", auth, async (request, reply) => {
    const { classId } = params(request); const teacherId = (request as TeacherRequest).teacherId;
    if (!ownedClass(db, teacherId, classId)) return reply.code(404).send({ error: "Class not found" });
    const row = db.prepare(`SELECT r.id, r.studentId FROM requests r JOIN request_types t ON t.id = r.requestTypeId
      JOIN students s ON s.id = r.studentId AND s.classId = r.classId AND s.teacherId = r.teacherId
      LEFT JOIN attendance a ON a.studentId = r.studentId AND a.periodId = (SELECT id FROM periods WHERE classId = r.classId AND teacherId = r.teacherId AND status = 'live' ORDER BY startedAt DESC LIMIT 1)
      WHERE r.teacherId = ? AND r.classId = ? AND r.status = 'active' AND t.behavior = 'attention'
        AND s.archived = 0 AND COALESCE(a.status, 'present') = 'present'
      ORDER BY r.joinedAt, r.rowid LIMIT 1`).get(teacherId, classId) as { id: string; studentId: string } | undefined;
    if (!row) return reply.code(404).send({ error: "No active attention request" });
    const timestamp = now(); db.prepare("UPDATE requests SET status = 'acknowledged', acknowledgedAt = ?, updatedAt = ? WHERE id = ? AND status = 'active'").run(timestamp, timestamp, row.id);
    notifyRequest(app, classId, row.id, row.studentId); return db.prepare("SELECT * FROM requests WHERE id = ?").get(row.id);
  });

  for (const action of ["acknowledge", "resolve", "cancel", "restore", "undo"] as const) {
    app.post(`/api/classes/:classId/requests/:requestId/${action}`, auth, async (request, reply) => {
      const { classId, requestId } = params(request); const teacherId = (request as TeacherRequest).teacherId;
      const row = db.prepare("SELECT id, studentId, status FROM requests WHERE id = ? AND classId = ? AND teacherId = ?").get(requestId, classId, teacherId) as { id: string; studentId: string; status: string } | undefined;
      if (!row) return reply.code(404).send({ error: "Request not found" });
      const restoring = action === "restore" || action === "undo";
      const allowed = action === "acknowledge" ? ["active"] : action === "resolve" || action === "cancel" ? ["active", "acknowledged"] : ["resolved", "cancelled"];
      if (!allowed.includes(row.status)) return reply.code(409).send({ error: `Request cannot be ${action}d from ${row.status}` });
      if (restoring && db.prepare("SELECT 1 FROM requests WHERE teacherId = ? AND classId = ? AND studentId = ? AND status IN ('active', 'acknowledged')").get(teacherId, classId, row.studentId)) return reply.code(409).send({ error: "Student already has an active request" });
      const timestamp = now();
      if (action === "acknowledge") db.prepare("UPDATE requests SET status = 'acknowledged', acknowledgedAt = ?, updatedAt = ? WHERE id = ?").run(timestamp, timestamp, requestId);
      if (action === "resolve") db.prepare("UPDATE requests SET status = 'resolved', resolvedAt = ?, cancelledAt = NULL, resolvedBy = ?, updatedAt = ? WHERE id = ?").run(timestamp, teacherId, timestamp, requestId);
      if (action === "cancel") db.prepare("UPDATE requests SET status = 'cancelled', cancelledAt = ?, resolvedAt = NULL, resolvedBy = NULL, updatedAt = ? WHERE id = ?").run(timestamp, timestamp, requestId);
      if (restoring) db.prepare("UPDATE requests SET status = 'active', acknowledgedAt = NULL, resolvedAt = NULL, cancelledAt = NULL, resolvedBy = NULL, updatedAt = ? WHERE id = ?").run(timestamp, requestId);
      notifyRequest(app, classId, requestId, row.studentId); return db.prepare("SELECT * FROM requests WHERE id = ?").get(requestId);
    });
  }

  app.get("/api/all-students/progress", auth, async (request) => {
    const teacherId = (request as TeacherRequest).teacherId;
    const query = request.query as Record<string, unknown>;
    const page = query.page === undefined ? 1 : Number(query.page);
    const pageSize = query.pageSize === undefined ? 100 : Number(query.pageSize);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return { rows: [], total: 0, page: 1, pageSize: 100 };
    const search = typeof query.search === "string" ? query.search.trim() : "";
    const classId = typeof query.classId === "string" ? query.classId : "";
    const support = query.support === "yes" ? "yes" : query.support === "no" ? "no" : "";
    const rows = db.prepare(`WITH normalized AS (
      SELECT s.id studentId, s.displayName, c.id classId, c.name className,
        COUNT(DISTINCT CASE WHEN p.status != 'scheduled' THEN p.id END) enrolledClassDays,
        COUNT(DISTINCT CASE WHEN p.status != 'scheduled' AND p.participationExpected = 1 AND COALESCE(a.status, 'present') = 'present' THEN p.id END) eligibleDays,
        COUNT(DISTINCT CASE WHEN p.status != 'scheduled' AND p.participationExpected = 1 AND COALESCE(a.status, 'present') = 'present' AND EXISTS (
          SELECT 1 FROM events pe WHERE pe.teacherId = s.teacherId AND pe.classId = s.classId AND pe.studentId = s.id AND pe.periodId = p.id AND pe.type = 'part+'
        ) THEN p.id END) positiveActionDays,
        COUNT(DISTINCT CASE WHEN p.status != 'scheduled' AND a.status = 'absent' THEN p.id END) absenceCount,
        (SELECT COUNT(*) FROM skills sk WHERE sk.teacherId=s.teacherId AND sk.classId=s.classId AND NOT EXISTS (SELECT 1 FROM skills child WHERE child.parentSkillId=sk.id AND child.classId=sk.classId AND child.teacherId=sk.teacherId)) totalSkills,
        (SELECT COUNT(*) FROM mastery m JOIN skills sk ON sk.id=m.skillId AND sk.classId=m.classId AND sk.teacherId=m.teacherId WHERE m.teacherId=s.teacherId AND m.classId=s.classId AND m.studentId=s.id AND m.achievement != 'not_started' AND NOT EXISTS (SELECT 1 FROM skills child WHERE child.parentSkillId=sk.id AND child.classId=sk.classId AND child.teacherId=sk.teacherId)) evidenceCount,
        (SELECT COUNT(*) FROM mastery m JOIN skills sk ON sk.id=m.skillId AND sk.classId=m.classId AND sk.teacherId=m.teacherId WHERE m.teacherId=s.teacherId AND m.classId=s.classId AND m.studentId=s.id AND m.achievement IN ('meets','exceeds') AND NOT EXISTS (SELECT 1 FROM skills child WHERE child.parentSkillId=sk.id AND child.classId=sk.classId AND child.teacherId=sk.teacherId)) meetOrExceedCount,
        (SELECT COUNT(*) FROM mastery m JOIN skills sk ON sk.id=m.skillId AND sk.classId=m.classId AND sk.teacherId=m.teacherId WHERE m.teacherId=s.teacherId AND m.classId=s.classId AND m.studentId=s.id AND m.requiresSupport=1 AND NOT EXISTS (SELECT 1 FROM skills child WHERE child.parentSkillId=sk.id AND child.classId=sk.classId AND child.teacherId=sk.teacherId)) supportCount,
        (SELECT MAX(e.timestamp) FROM events e WHERE e.teacherId=s.teacherId AND e.classId=s.classId AND e.studentId=s.id AND e.type IN ('part+','part-')) lastActionAt
      FROM students s JOIN classes c ON c.id=s.classId AND c.teacherId=s.teacherId
      LEFT JOIN periods p ON p.teacherId=s.teacherId AND p.classId=s.classId AND p.startedAt>=s.enrolledAt AND (s.archivedAt IS NULL OR p.startedAt<=s.archivedAt)
      LEFT JOIN attendance a ON a.teacherId=s.teacherId AND a.classId=s.classId AND a.periodId=p.id AND a.studentId=s.id
      WHERE s.teacherId=? GROUP BY s.id, s.displayName, c.id, c.name
    ) SELECT * FROM normalized WHERE (?='' OR displayName LIKE '%'||?||'%') AND (?='' OR classId=?)
      AND (?='' OR (?='yes' AND supportCount>0) OR (?='no' AND supportCount=0))
      ORDER BY className COLLATE NOCASE, displayName COLLATE NOCASE LIMIT ? OFFSET ?`).all(teacherId, search, search, classId, classId, support, support, support, pageSize, (page - 1) * pageSize);
    const count = db.prepare("SELECT COUNT(*) total FROM students s WHERE s.teacherId=? AND (?='' OR s.displayName LIKE '%'||?||'%') AND (?='' OR s.classId=?) AND (?='' OR (?='yes' AND EXISTS (SELECT 1 FROM mastery m WHERE m.teacherId=s.teacherId AND m.classId=s.classId AND m.studentId=s.id AND m.requiresSupport=1)) OR (?='no' AND NOT EXISTS (SELECT 1 FROM mastery m WHERE m.teacherId=s.teacherId AND m.classId=s.classId AND m.studentId=s.id AND m.requiresSupport=1)))")
      .get(teacherId, search, search, classId, classId, support, support, support) as { total: number };
    return { rows, total: count.total, page, pageSize };
  });
}
