import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createReadStream } from "node:fs";
import { access, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { randomBytes } from "node:crypto";
import type { AppDatabase } from "./db.js";
import { id, now } from "./support.js";
import type { TeacherRequest } from "./teacher-routes.js";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const SENSITIVITY = "sensitive teacher-only evidence";
type PhotoRow = { id: string; teacherId: string; classId: string; studentId: string; skillId: string; periodId: string | null; assessedAt: string; mimeType: string; storageKey: string; originalFilename: string | null; createdAt: string };

function metadata(photo: PhotoRow) {
  return {
    id: photo.id,
    classId: photo.classId,
    studentId: photo.studentId,
    skillId: photo.skillId,
    periodId: photo.periodId,
    assessedAt: photo.assessedAt,
    mimeType: photo.mimeType,
    originalFilename: photo.originalFilename,
    createdAt: photo.createdAt,
    sensitivity: SENSITIVITY,
    imageUrl: `/api/classes/${photo.classId}/photos/${photo.id}/image`,
  };
}

function validImage(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp") return buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  return false;
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function timestamp(value: string | undefined): string {
  if (!value) return now();
  if (Number.isNaN(Date.parse(value))) throw new Error("X-Assessed-At must be a valid timestamp");
  const result = new Date(value).toISOString();
  if (Date.parse(result) > Date.now() + 5 * 60_000 || Date.parse(result) < Date.UTC(2000, 0, 1)) throw new Error("X-Assessed-At is outside the allowed range");
  return result;
}

export function photoManifest(db: AppDatabase, teacherId: string, classId: string) {
  const rows = db.prepare("SELECT id, teacherId, classId, studentId, skillId, periodId, assessedAt, mimeType, storageKey, originalFilename, createdAt FROM skill_evidence_photos WHERE teacherId = ? AND classId = ? ORDER BY assessedAt, createdAt").all(teacherId, classId) as PhotoRow[];
  return rows.map(metadata);
}

export async function deletePhotoFiles(photoDir: string, storageKeys: string[]) {
  await Promise.all(storageKeys.map((key) => unlink(join(photoDir, basename(key))).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") console.error("Unable to remove photo evidence file", { storageKey: key, code: error.code });
  })));
}

export function registerPhotoRoutes(app: FastifyInstance, db: AppDatabase, photoDir: string, requireTeacher: (request: FastifyRequest, reply: FastifyReply) => Promise<void>) {
  const auth = { preHandler: requireTeacher };
  for (const mimeType of ["image/jpeg", "image/png", "image/webp"]) {
    if (!app.hasContentTypeParser(mimeType)) app.addContentTypeParser(mimeType, { parseAs: "buffer", bodyLimit: MAX_PHOTO_BYTES }, (_request, body, done) => done(null, body));
  }

  app.post("/api/classes/:classId/students/:studentId/skills/:skillId/photos", { ...auth, bodyLimit: MAX_PHOTO_BYTES }, async (request, reply) => {
    const { classId, studentId, skillId } = request.params as Record<string, string>;
    const teacherId = (request as TeacherRequest).teacherId;
    const mimeType = String(request.headers["content-type"] ?? "").split(";", 1)[0].toLowerCase();
    const body = request.body;
    if (!Buffer.isBuffer(body) || !validImage(body, mimeType)) return reply.code(415).send({ error: "Photo must be a valid JPEG, PNG, or WebP image matching Content-Type" });
    if (!body.length || body.length > MAX_PHOTO_BYTES) return reply.code(413).send({ error: "Photo must not exceed 5MB" });
    const owned = db.prepare(`SELECT 1 FROM classes c
      JOIN students s ON s.id = ? AND s.classId = c.id AND s.teacherId = c.teacherId
      JOIN skills k ON k.id = ? AND k.classId = c.id AND k.teacherId = c.teacherId
      WHERE c.id = ? AND c.teacherId = ?`).get(studentId, skillId, classId, teacherId);
    if (!owned) return reply.code(404).send({ error: "Class, student, or skill not found" });
    const periodId = header(request, "x-period-id")?.trim() || null;
    if (periodId && !db.prepare("SELECT 1 FROM periods WHERE id = ? AND classId = ? AND teacherId = ? AND status = 'live'").get(periodId, classId, teacherId)) return reply.code(409).send({ error: "Photo evidence can only be added during a class day in progress; reopen a closed class day first" });
    let assessedAt: string;
    try { assessedAt = timestamp(header(request, "x-assessed-at")); }
    catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
    const suppliedName = header(request, "x-filename");
    const originalFilename = suppliedName ? basename(suppliedName).replace(/[\x00-\x1f\x7f]/g, "").slice(0, 255) || null : null;
    const photoId = id();
    const extension = mimeType === "image/jpeg" ? ".jpg" : mimeType === "image/png" ? ".png" : ".webp";
    const storageKey = `${randomBytes(24).toString("hex")}${extension}`;
    const temporary = join(photoDir, `.${storageKey}.tmp`);
    const destination = join(photoDir, storageKey);
    await mkdir(photoDir, { recursive: true });
    try {
      await writeFile(temporary, body, { flag: "wx", mode: 0o600 });
      await rename(temporary, destination);
      const createdAt = now();
      db.prepare("INSERT INTO skill_evidence_photos (id, teacherId, classId, studentId, skillId, periodId, assessedAt, mimeType, storageKey, originalFilename, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(photoId, teacherId, classId, studentId, skillId, periodId, assessedAt, mimeType, storageKey, originalFilename, createdAt);
      return reply.code(201).send(metadata({ id: photoId, teacherId, classId, studentId, skillId, periodId, assessedAt, mimeType, storageKey, originalFilename, createdAt }));
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      await unlink(destination).catch(() => undefined);
      throw error;
    }
  });

  app.get("/api/classes/:classId/photos", auth, async (request, reply) => {
    const { classId } = request.params as { classId: string };
    const teacherId = (request as TeacherRequest).teacherId;
    if (!db.prepare("SELECT 1 FROM classes WHERE id = ? AND teacherId = ?").get(classId, teacherId)) return reply.code(404).send({ error: "Class not found" });
    const query = request.query as { studentId?: string; skillId?: string };
    const photos = photoManifest(db, teacherId, classId).filter((photo) => (!query.studentId || photo.studentId === query.studentId) && (!query.skillId || photo.skillId === query.skillId));
    return { photos, sensitivity: SENSITIVITY, access: "teacher-only" };
  });

  app.get("/api/classes/:classId/photos/:photoId/image", auth, async (request, reply) => {
    const { classId, photoId } = request.params as Record<string, string>;
    const teacherId = (request as TeacherRequest).teacherId;
    const photo = db.prepare("SELECT mimeType, storageKey FROM skill_evidence_photos WHERE id = ? AND classId = ? AND teacherId = ?").get(photoId, classId, teacherId) as Pick<PhotoRow, "mimeType" | "storageKey"> | undefined;
    if (!photo) return reply.code(404).send({ error: "Photo not found" });
    const filePath = join(photoDir, basename(photo.storageKey));
    try { await access(filePath); }
    catch { return reply.code(404).send({ error: "Photo file not found" }); }
    reply.header("Cache-Control", "private, no-store, max-age=0").header("Pragma", "no-cache").header("X-Content-Type-Options", "nosniff").type(photo.mimeType);
    return reply.send(createReadStream(filePath));
  });

  app.delete("/api/classes/:classId/photos/:photoId", auth, async (request, reply) => {
    const { classId, photoId } = request.params as Record<string, string>;
    const teacherId = (request as TeacherRequest).teacherId;
    const photo = db.prepare("SELECT storageKey FROM skill_evidence_photos WHERE id = ? AND classId = ? AND teacherId = ?").get(photoId, classId, teacherId) as { storageKey: string } | undefined;
    if (!photo) return reply.code(404).send({ error: "Photo not found" });
    db.prepare("DELETE FROM skill_evidence_photos WHERE id = ? AND classId = ? AND teacherId = ?").run(photoId, classId, teacherId);
    await deletePhotoFiles(photoDir, [photo.storageKey]);
    return reply.code(204).send();
  });
}
