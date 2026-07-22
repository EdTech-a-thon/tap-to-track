import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import argon2 from "argon2";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { createDatabase, type AppDatabase } from "./db.js";
import { registerStudentRoutes } from "./student-routes.js";
import {
  id,
  now,
  object,
  readStudentToken,
  secureRequest,
  text,
} from "./support.js";
import { registerTeacherRoutes } from "./teacher-routes.js";
import { registerTransferRoutes } from "./transfer-routes.js";
import { registerPhotoRoutes } from "./photo-routes.js";

declare module "fastify" {
  interface FastifyInstance {
    broadcastClass?: (
      classId: string,
      message: Record<string, unknown>,
    ) => void;
    notifyStudent?: (
      classId: string,
      studentId: string,
      message: Record<string, unknown>,
    ) => void;
  }
}

type Session = { teacherId: string };
type SocketClient = {
  socket: WebSocket;
  teacherId?: string;
  student?: { classId: string; studentId: string };
  classes: Set<string>;
};

export interface ServerOptions {
  db?: AppDatabase;
  sessionSecret?: string;
  baseUrl?: string;
  allowedOrigins?: string[];
  logger?: boolean;
  photoDir?: string;
}

export async function buildServer(options: ServerOptions = {}) {
  const production = process.env.NODE_ENV === "production";
  const baseUrl =
    options.baseUrl ?? process.env.BASE_URL ?? "http://127.0.0.1:8000";
  const sessionSecret =
    options.sessionSecret ??
    process.env.SESSION_SECRET ??
    (production ? "" : "tap-to-track-development-secret-change-me");
  if (sessionSecret.length < 24)
    throw new Error("SESSION_SECRET must contain at least 24 characters");
  const db = options.db ?? createDatabase();
  const photoDir = resolve(
    options.photoDir ?? process.env.PHOTO_DIR ?? "data/photos",
  );
  const app = Fastify({
    logger: options.logger ?? production,
    trustProxy: true,
  });
  await app.register(cookie, { secret: sessionSecret, hook: "onRequest" });
  await app.register(rateLimit, { global: false });

  const configuredOrigins =
    options.allowedOrigins ??
    (process.env.ALLOWED_ORIGINS?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) || [new URL(baseUrl).origin]);
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && !configuredOrigins.includes(origin))
      return reply.code(403).send({ error: "Origin not allowed" });
    if (origin) {
      reply.header("access-control-allow-origin", origin);
      reply.header("access-control-allow-credentials", "true");
      reply.header("vary", "Origin");
    }
    if (request.method === "OPTIONS") {
      reply.header(
        "access-control-allow-methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      );
      reply.header(
        "access-control-allow-headers",
        "content-type,x-filename,x-period-id,x-assessed-at",
      );
      return reply.code(204).send();
    }
  });

  const cookieOptions = (request: FastifyRequest) => ({
    path: "/",
    httpOnly: true,
    sameSite: "strict" as const,
    secure: secureRequest(request, baseUrl),
    signed: true,
    maxAge: 60 * 60 * 24 * 14,
  });
  const sessionFor = (request: FastifyRequest): Session | null => {
    const raw = request.cookies.session;
    if (!raw) return null;
    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return null;
    const row = db
      .prepare("SELECT teacherId FROM sessions WHERE id = ? AND expiresAt > ?")
      .get(unsigned.value, now()) as Session | undefined;
    return row ?? null;
  };
  const requireTeacher = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const session = sessionFor(request);
    if (!session)
      return reply.code(401).send({ error: "Authentication required" });
    (request as FastifyRequest & Session).teacherId = session.teacherId;
  };

  const authRate = {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  };
  app.post("/api/auth/signup", authRate, async (request, reply) => {
    try {
      const body = object(request.body);
      const email = text(body.email, "Email", 254).toLowerCase();
      const password = text(body.password, "Password", 200);
      if (!/^\S+@\S+\.\S+$/.test(email))
        return reply.code(400).send({ error: "A valid email is required" });
      if (password.length < 8)
        return reply
          .code(400)
          .send({ error: "Password must be at least 8 characters" });
      const teacherId = id();
      const passwordHash = await argon2.hash(password);
      try {
        db.prepare(
          "INSERT INTO teachers (id, email, passwordHash, createdAt) VALUES (?, ?, ?, ?)",
        ).run(teacherId, email, passwordHash, now());
      } catch {
        return reply.code(409).send({ error: "Account already exists" });
      }
      return createSession(
        db,
        teacherId,
        email,
        request,
        reply,
        cookieOptions(request),
      );
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.post("/api/auth/login", authRate, async (request, reply) => {
    try {
      const body = object(request.body);
      const email = text(body.email, "Email", 254).toLowerCase();
      const password = text(body.password, "Password", 200);
      const teacher = db
        .prepare("SELECT id, email, passwordHash FROM teachers WHERE email = ?")
        .get(email) as
        { id: string; email: string; passwordHash: string } | undefined;
      if (!teacher || !(await argon2.verify(teacher.passwordHash, password)))
        return reply.code(401).send({ error: "Invalid email or password" });
      return createSession(
        db,
        teacher.id,
        teacher.email,
        request,
        reply,
        cookieOptions(request),
      );
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const raw = request.cookies.session;
    if (raw) {
      const unsigned = request.unsignCookie(raw);
      if (unsigned.valid && unsigned.value)
        db.prepare("DELETE FROM sessions WHERE id = ?").run(unsigned.value);
    }
    reply.clearCookie("session", { path: "/" });
    return reply.code(204).send();
  });
  app.get("/api/auth/me", { preHandler: requireTeacher }, async (request) =>
    db
      .prepare("SELECT id, email, createdAt FROM teachers WHERE id = ?")
      .get((request as FastifyRequest & Session).teacherId),
  );

  const sockets = setupWebSockets(app, db, sessionSecret, configuredOrigins);
  registerPhotoRoutes(app, db, photoDir, requireTeacher);
  registerTeacherRoutes(app, db, photoDir, requireTeacher);
  registerStudentRoutes(app, db, sessionSecret, baseUrl);
  registerTransferRoutes(app, db, requireTeacher);

  const dist = resolve(fileURLToPath(new URL("..", import.meta.url)), "dist");
  if (production && existsSync(dist)) {
    await app.register(fastifyStatic, {
      root: dist,
      setHeaders(reply, filePath) {
        if (/assets\/index-(?:bwJgPW9Y|B1jKkSO8)\.(?:js|css)$/i.test(filePath))
          reply.header("Cache-Control", "no-store, max-age=0");
        else if (filePath.includes("/assets/") || /workbox-[a-f0-9]+\.js$/i.test(filePath))
          reply.header("Cache-Control", "public, max-age=31536000, immutable");
        else if (filePath.endsWith("index.html") || filePath.endsWith("sw.js"))
          reply.header("Cache-Control", "no-store, max-age=0");
      },
    });
    app.setNotFoundHandler(async (request, reply) => {
      if (
        request.url.startsWith("/api/") ||
        request.url === "/ws" ||
        request.url.startsWith("/assets/") ||
        /\.[a-z0-9]+$/i.test(request.url)
      )
        return reply.code(404).send({ error: "Not found" });
      return reply
        .header("Cache-Control", "no-store, max-age=0")
        .sendFile("index.html");
    });
  }
  app.addHook("onClose", async () => {
    for (const client of sockets) client.socket.close();
    db.close();
  });
  return app;
}

function createSession(
  db: AppDatabase,
  teacherId: string,
  email: string,
  request: FastifyRequest,
  reply: FastifyReply,
  options: Record<string, unknown>,
) {
  const sessionId = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + 14 * 24 * 60 * 60 * 1000,
  ).toISOString();
  db.prepare("DELETE FROM sessions WHERE expiresAt <= ?").run(now());
  db.prepare(
    "INSERT INTO sessions (id, teacherId, expiresAt) VALUES (?, ?, ?)",
  ).run(sessionId, teacherId, expiresAt);
  reply.setCookie("session", sessionId, options);
  return reply.code(201).send({ teacher: { id: teacherId, email } });
}

function setupWebSockets(
  app: FastifyInstance,
  db: AppDatabase,
  secret: string,
  allowedOrigins: string[],
) {
  const clients = new Set<SocketClient>();
  const server = new WebSocketServer({ noServer: true });
  app.broadcastClass = (classId: string, message: Record<string, unknown>) => {
    const data = JSON.stringify(message);
    for (const client of clients)
      if (
        client.classes.has(classId) &&
        (client.teacherId || message.type === "timer-state" || message.type === "student-refresh") &&
        (message.type !== "request-updated" || client.teacherId) &&
        client.socket.readyState === WebSocket.OPEN
      )
        client.socket.send(data);
  };
  app.notifyStudent = (
    classId: string,
    studentId: string,
    message: Record<string, unknown>,
  ) => {
    const data = JSON.stringify(message);
    for (const client of clients)
      if (
        client.student?.classId === classId &&
        client.student.studentId === studentId &&
        client.socket.readyState === WebSocket.OPEN
      )
        client.socket.send(data);
  };
  app.server.on(
    "upgrade",
    (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(request.url ?? "/", "http://server");
      if (url.pathname !== "/ws") return socket.destroy();
      const origin = request.headers.origin;
      if (origin && !allowedOrigins.includes(origin)) return socket.destroy();
      const cookies: Record<string, string> = {};
      for (const part of (request.headers.cookie ?? "").split(";")) {
        const [key, value] = part.trim().split(/=(.*)/s).slice(0, 2);
        if (key) cookies[key] = decodeURIComponent(value ?? "");
      }
      const signedSession = cookies.session
        ? app.unsignCookie(cookies.session)
        : null;
      const teacher = signedSession?.valid
        ? (db
            .prepare(
              "SELECT teacherId FROM sessions WHERE id = ? AND expiresAt > ?",
            )
            .get(signedSession.value, now()) as Session | undefined)
        : undefined;
      const student = readStudentToken(secret, cookies.student_access);
      if (!teacher && !student) return socket.destroy();
      server.handleUpgrade(request, socket, head, (ws) =>
        server.emit("connection", ws, { teacher, student }),
      );
    },
  );
  server.on(
    "connection",
    (
      socket: WebSocket,
      auth: {
        teacher?: Session;
        student?: { classId: string; studentId: string };
      },
    ) => {
      const client: SocketClient = {
        socket,
        teacherId: auth.teacher?.teacherId,
        student: auth.student,
        classes: new Set(auth.student ? [auth.student.classId] : []),
      };
      clients.add(client);
      socket.on("message", (raw) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(raw.toString()) as Record<string, unknown>;
        } catch {
          return;
        }
        if (
          message.type === "subscribe" &&
          typeof message.classId === "string" &&
          client.teacherId &&
          db
            .prepare("SELECT 1 FROM classes WHERE id = ? AND teacherId = ?")
            .get(message.classId, client.teacherId)
        )
          client.classes.add(message.classId);
        if (
          message.type === "unsubscribe" &&
          typeof message.classId === "string"
        )
          client.classes.delete(message.classId);
      });
      socket.on("close", () => clients.delete(client));
      socket.send(JSON.stringify({ type: "connected" }));
    },
  );
  return clients;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = await buildServer();
  await app.listen({ port: Number(process.env.PORT ?? 8000), host: "0.0.0.0" });
}
