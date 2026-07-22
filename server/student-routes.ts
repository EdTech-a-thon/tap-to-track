import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppDatabase } from "./db.js";
import {
  json,
  now,
  object,
  readStudentToken,
  secureRequest,
  studentToken,
  text,
} from "./support.js";

interface StudentRequest extends FastifyRequest {
  studentAccess: { classId: string; studentId: string };
}
type Row = Record<string, unknown>;

export function registerStudentRoutes(
  app: FastifyInstance,
  db: AppDatabase,
  secret: string,
  baseUrl: string,
) {
  const requireStudent = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const access = readStudentToken(secret, request.cookies.student_access);
    if (!access)
      return reply.code(401).send({ error: "Student access required" });
    const exists = db
      .prepare(
        "SELECT 1 FROM students WHERE id = ? AND classId = ? AND archived = 0",
      )
      .get(access.studentId, access.classId);
    if (!exists)
      return reply.code(401).send({ error: "Student access expired" });
    (request as StudentRequest).studentAccess = access;
  };

  app.get("/api/student/join/:joinCode", async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    const room = db
      .prepare("SELECT id, name, settings FROM classes WHERE joinCode = ?")
      .get(joinCode.toUpperCase()) as Row | undefined;
    if (!room || json<Record<string, unknown>>(String(room.settings)).archived)
      return reply.code(404).send({ error: "Class not found" });
    const roster = db
      .prepare(
        "SELECT id, displayName FROM students WHERE classId = ? AND archived = 0 ORDER BY displayName",
      )
      .all(room.id) as Row[];
    return {
      classRoom: { id: room.id, name: room.name },
      students: roster.map((student) => ({
        id: student.id,
        displayName: student.displayName,
      })),
    };
  });

  app.post("/api/student/join/:joinCode/select", async (request, reply) => {
    try {
      const { joinCode } = request.params as { joinCode: string };
      const studentId = text(object(request.body).studentId, "Student ID");
      const student = db
        .prepare(
          "SELECT s.id, s.classId, s.displayName FROM students s JOIN classes c ON c.id = s.classId WHERE c.joinCode = ? AND s.id = ? AND s.archived = 0",
        )
        .get(joinCode.toUpperCase(), studentId) as Row | undefined;
      if (!student) return reply.code(404).send({ error: "Student not found" });
      reply.setCookie(
        "student_access",
        studentToken(secret, String(student.classId), String(student.id)),
        {
          path: "/",
          httpOnly: true,
          sameSite: "strict",
          secure: secureRequest(request, baseUrl),
          maxAge: 60 * 60 * 12,
        },
      );
      return {
        student: {
          id: student.id,
          classId: student.classId,
          displayName: student.displayName,
        },
      };
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.post("/api/student/logout", async (_request, reply) => {
    reply.clearCookie("student_access", { path: "/" });
    return reply.code(204).send();
  });

  app.get(
    "/api/student/me",
    { preHandler: requireStudent },
    async (request, reply) => {
      const { classId, studentId } = (request as StudentRequest).studentAccess;
      const row = db
        .prepare(
          "SELECT s.id, s.classId, s.displayName, c.name className FROM students s JOIN classes c ON c.id = s.classId WHERE s.id = ? AND s.classId = ?",
        )
        .get(studentId, classId) as Row | undefined;
      if (!row) return reply.code(404).send({ error: "Student not found" });
      return ownView(db, row);
    },
  );

  app.get("/api/student/timer", { preHandler: requireStudent }, async (request) => {
    const { classId } = (request as StudentRequest).studentAccess;
    const timer = db.prepare("SELECT classId, periodId, status, label, durationSeconds, endsAt, remainingSeconds, revision, updatedAt FROM class_timers WHERE classId = ?").get(classId) as Row | undefined;
    if (timer?.status === "running" && timer.endsAt && Date.parse(String(timer.endsAt)) <= Date.now()) {
      db.prepare("UPDATE class_timers SET status='finished', endsAt=NULL, remainingSeconds=0, revision=revision+1, updatedAt=? WHERE classId=? AND revision=?").run(now(), classId, timer.revision);
      return { timer: db.prepare("SELECT classId, periodId, status, label, durationSeconds, endsAt, remainingSeconds, revision, updatedAt FROM class_timers WHERE classId = ?").get(classId) };
    }
    return { timer: timer ?? null };
  });

  app.post(
    "/api/student/requests/:requestTypeId",
    { preHandler: requireStudent },
    async (request, reply) => {
      const { classId, studentId } = (request as StudentRequest).studentAccess;
      const { requestTypeId } = request.params as { requestTypeId: string };
      const type = db
        .prepare(
          "SELECT teacherId FROM request_types WHERE id = ? AND classId = ?",
        )
        .get(requestTypeId, classId) as { teacherId: string } | undefined;
      if (!type)
        return reply.code(404).send({ error: "Request type not found" });
      const active = db
        .prepare(
          "SELECT id FROM requests WHERE teacherId = ? AND classId = ? AND studentId = ? AND status IN ('active', 'acknowledged')",
        )
        .get(type.teacherId, classId, studentId) as { id: string } | undefined;
      if (active)
        return reply
          .code(409)
          .send({
            error: "You already have an active request",
            requestId: active.id,
          });
      const requestId = crypto.randomUUID();
      const joinedAt = now();
      db.prepare(
        "INSERT INTO requests (id, teacherId, classId, studentId, requestTypeId, status, joinedAt, updatedAt) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
      ).run(
        requestId,
        type.teacherId,
        classId,
        studentId,
        requestTypeId,
        joinedAt,
        joinedAt,
      );
      const message = {
        type: "request-updated",
        classId,
        requestId,
        studentId,
      };
      app.broadcastClass?.(classId, message);
      app.notifyStudent?.(classId, studentId, message);
      return reply
        .code(201)
        .send({
          id: requestId,
          requestTypeId,
          status: "active",
          joinedAt,
          updatedAt: joinedAt,
        });
    },
  );

  app.delete(
    "/api/student/requests/:requestTypeId",
    { preHandler: requireStudent },
    async (request, reply) => {
      const { classId, studentId } = (request as StudentRequest).studentAccess;
      const { requestTypeId } = request.params as { requestTypeId: string };
      const active = db
        .prepare(
          "SELECT id FROM requests WHERE classId = ? AND studentId = ? AND requestTypeId = ? AND status IN ('active', 'acknowledged') ORDER BY joinedAt LIMIT 1",
        )
        .get(classId, studentId, requestTypeId) as { id: string } | undefined;
      if (!active)
        return reply.code(404).send({ error: "Active request not found" });
      const timestamp = now();
      db.prepare(
        "UPDATE requests SET status = 'cancelled', cancelledAt = ?, updatedAt = ? WHERE id = ? AND classId = ? AND studentId = ?",
      ).run(timestamp, timestamp, active.id, classId, studentId);
      const message = {
        type: "request-updated",
        classId,
        requestId: active.id,
        studentId,
      };
      app.broadcastClass?.(classId, message);
      app.notifyStudent?.(classId, studentId, message);
      return reply.code(204).send();
    },
  );
}

function ownView(db: AppDatabase, row: Row) {
  const classId = String(row.classId);
  const studentId = String(row.id);
  const requestTypes = db
    .prepare(
      "SELECT id, label, color, behavior, resolveLabel FROM request_types WHERE classId = ?",
    )
    .all(classId) as Row[];
  const requests = db
    .prepare(
      `SELECT r.id, r.requestTypeId, r.status, r.joinedAt, r.acknowledgedAt, r.resolvedAt,
    r.cancelledAt, r.updatedAt, t.behavior FROM requests r JOIN request_types t ON t.id = r.requestTypeId
    WHERE r.classId = ? AND r.studentId = ? AND (r.status IN ('active', 'acknowledged') OR r.id = (
      SELECT recent.id FROM requests recent WHERE recent.classId = r.classId AND recent.studentId = r.studentId
        AND recent.status = 'resolved' ORDER BY recent.updatedAt DESC, recent.rowid DESC LIMIT 1
    )) ORDER BY CASE WHEN r.status IN ('active', 'acknowledged') THEN 0 ELSE 1 END, r.updatedAt DESC`,
    )
    .all(classId, studentId) as Row[];
  const requestPositions = requests
    .filter(
      (request) =>
        (request.status === "active" || request.status === "acknowledged") && request.behavior === "attention",
    )
    .map((request) => ({
      requestId: request.id,
      requestTypeId: request.requestTypeId,
       position: (
         db.prepare(`SELECT COUNT(*) count FROM requests queued JOIN request_types type ON type.id = queued.requestTypeId
           JOIN students s ON s.id = queued.studentId
           LEFT JOIN attendance a ON a.studentId = queued.studentId AND a.periodId = (SELECT id FROM periods WHERE classId = ? AND status = 'live' ORDER BY startedAt DESC LIMIT 1)
           WHERE queued.classId = ? AND queued.status IN ('active', 'acknowledged') AND type.behavior = 'attention'
             AND (queued.joinedAt < ? OR (queued.joinedAt = ? AND queued.rowid <= (SELECT rowid FROM requests WHERE id = ?)))
             AND s.archived = 0 AND COALESCE(a.status, 'present') = 'present'`)
           .get(classId, classId, request.joinedAt, request.joinedAt, request.id) as { count: number }
       ).count,
    }));
  const timer = db.prepare("SELECT classId, periodId, status, label, durationSeconds, endsAt, remainingSeconds, revision, updatedAt FROM class_timers WHERE classId = ?").get(classId) as Row | undefined;
  if (timer?.status === "running" && timer.endsAt && Date.parse(String(timer.endsAt)) <= Date.now()) {
    db.prepare("UPDATE class_timers SET status='finished', endsAt=NULL, remainingSeconds=0, revision=revision+1, updatedAt=? WHERE classId=? AND revision=?").run(now(), classId, timer.revision);
  }
  const participationDays = db.prepare(`SELECT p.id,
      EXISTS(SELECT 1 FROM events e WHERE e.periodId = p.id AND e.studentId = ? AND e.type = 'part+') participated
    FROM periods p JOIN students s ON s.id = ? AND s.classId = p.classId
    LEFT JOIN attendance a ON a.periodId = p.id AND a.studentId = s.id
    WHERE p.classId = ? AND p.status != 'scheduled' AND p.participationExpected = 1
      AND p.startedAt >= s.enrolledAt AND (s.archivedAt IS NULL OR p.startedAt <= s.archivedAt)
      AND COALESCE(a.status, 'present') = 'present'`).all(studentId, studentId, classId) as { participated: number }[];
  return {
    student: {
      id: row.id,
      classId,
      displayName: row.displayName,
    },
    classRoom: {
      id: classId,
      name: row.className,
    },
    requestTypes,
    requests,
    requestPositions,
    participation: { participatedDays: participationDays.filter((day) => Boolean(day.participated)).length, eligibleDays: participationDays.length },
    timer: db.prepare("SELECT classId, periodId, status, label, durationSeconds, endsAt, remainingSeconds, revision, updatedAt FROM class_timers WHERE classId = ?").get(classId) ?? null,
  };
}
