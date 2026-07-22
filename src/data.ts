import Dexie, { type EntityTable } from "dexie";
import type {
  AttendanceStatus,
  ClassReport,
  ClassRoom,
  ClassSnapshot,
  Achievement,
  AllClassProgressRow,
  ClassTimer,
  ParticipationAction,
  Period,
  SkillPhoto,
} from "./types";

type CachedSnapshot = {
  classId: string;
  value: ClassSnapshot;
  updatedAt: number;
};
export type PendingChange = {
  id: string;
  method: string;
  path: string;
  body?: unknown;
  createdAt: number;
  failedAt?: number;
  error?: string;
  status?: number;
};
export type FailedChange = Pick<PendingChange, "id" | "method" | "path" | "createdAt" | "failedAt" | "error" | "status">;
export type SyncStatus = {
  state: "saved" | "saving" | "offline" | "needs-attention";
  pendingCount: number;
  failed: FailedChange[];
};
type Listener = (snapshot: ClassSnapshot) => void;
export type RequestUpdatedMessage = {
  type: "request-updated";
  classId: string;
  requestId: string;
  studentId: string;
};
type RequestListener = (message: RequestUpdatedMessage) => void;

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

const db = new Dexie("tap-to-track") as Dexie & {
  snapshots: EntityTable<CachedSnapshot, "classId">;
  outbox: EntityTable<PendingChange, "id">;
};
db.version(1).stores({
  snapshots: "classId,updatedAt",
  outbox: "id,createdAt",
});
db.version(2).stores({ outbox: "id,createdAt,failedAt" });

export interface DataStore {
  signIn(email: string, password: string, create?: boolean): Promise<void>;
  signOut(): Promise<void>;
  getClasses(): Promise<ClassRoom[]>;
  getAllProgress(query?: string): Promise<{ rows: AllClassProgressRow[]; total: number; page: number; pageSize: number }>;
  getParticipationActions(classId: string, query: string): Promise<ParticipationAction[]>;
  updateParticipationAction(classId: string, eventId: string, type: "part+" | "part-"): Promise<void>;
  deleteParticipationAction(classId: string, eventId: string): Promise<void>;
  getTimer(classId: string): Promise<ClassTimer | null>;
  timerAction(classId: string, action: "start" | "pause" | "resume" | "stop" | "add-time", body?: unknown): Promise<ClassTimer>;
  getReport(classId: string, query: string): Promise<ClassReport>;
  getCalendar(
    from: string,
    to: string,
  ): Promise<{
    classes: ClassRoom[];
    periods: (Period & { className: string })[];
  }>;
  createCalendarDays(
    body: unknown,
  ): Promise<{ created: { id: string; classId: string }[]; skipped: string[] }>;
  getSnapshot(classId: string, refresh?: boolean): Promise<ClassSnapshot>;
  createClass(name: string): Promise<ClassRoom>;
  joinClass(code: string): Promise<unknown>;
  selectStudent(code: string, studentId: string): Promise<unknown>;
  getStudentView(): Promise<unknown>;
  studentAction(
    path: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    body?: unknown,
  ): Promise<unknown>;
  mutate(
    classId: string,
    path: string,
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    body?: unknown,
  ): Promise<ClassSnapshot>;
  markAttendance(
    classId: string,
    periodId: string,
    studentId: string,
    status: AttendanceStatus,
  ): Promise<ClassSnapshot>;
  setPeriodAttendance(classId: string, periodId: string, status: AttendanceStatus, studentIds?: string[]): Promise<ClassSnapshot>;
  completeAttendance(classId: string, periodId: string): Promise<ClassSnapshot>;
  finishPeriod(classId: string, periodId: string, confirmAttendanceIncomplete?: boolean): Promise<ClassSnapshot>;
  addParticipation(
    classId: string,
    periodId: string,
    studentId: string,
    amount: 1 | -1,
  ): Promise<ClassSnapshot>;
  setMastery(
    classId: string,
    studentId: string,
    skillId: string,
    update: { achievement?: Achievement; requiresSupport?: boolean; note?: string },
    assessedAt: string,
    periodId?: string,
  ): Promise<ClassSnapshot>;
  reorderSkills(classId: string, skillIds: string[]): Promise<ClassSnapshot>;
  cloneSkills(
    destinationClassId: string,
    sourceClassId: string,
    mode: "merge" | "replace",
  ): Promise<{
    mode: "merge" | "replace";
    created: number;
    skipped: number;
    removed: number;
  }>;
  getSkillPhotos(classId: string, studentId: string, skillId?: string): Promise<SkillPhoto[]>;
  uploadSkillPhoto(classId: string, studentId: string, skillId: string, file: Blob, options: { filename?: string; periodId?: string; assessedAt: string }): Promise<SkillPhoto>;
  deleteSkillPhoto(classId: string, photoId: string): Promise<void>;
  requestAction(classId: string, requestId: string, action: "acknowledge" | "resolve" | "cancel" | "restore"): Promise<ClassSnapshot>;
  acknowledgeNextRequest(classId: string): Promise<ClassSnapshot>;
  sync(): Promise<void>;
  getSyncStatus(): SyncStatus;
  subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void;
  retryChange(id: string): Promise<void>;
  discardChange(id: string): Promise<void>;
  hasUnsavedChanges(): boolean;
  subscribe(classId: string, listener: Listener): () => void;
  subscribeRequestUpdates(classId: string, listener: RequestListener): () => void;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers,
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    let detail: { error?: string; code?: string } = {};
    try { detail = JSON.parse(text) as typeof detail; } catch { /* Plain-text response. */ }
    throw new RequestError(detail.error || text || `Request failed (${response.status})`, response.status, detail.code);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

class BrowserDataStore implements DataStore {
  private listeners = new Map<string, Set<Listener>>();
  private requestListeners = new Map<string, Set<RequestListener>>();
  private socket?: WebSocket;
  private socketRetry?: number;
  private socketAttempts = 0;
  private socketClosedIntentionally = false;
  private syncPromise?: Promise<void>;
  private syncRetry?: number;
  private syncAttempts = 0;
  private syncListeners = new Set<(status: SyncStatus) => void>();
  private syncStatus: SyncStatus = { state: "saved", pendingCount: 0, failed: [] };
  private uploadCount = 0;
  private networkUnavailable = false;
  private reconcilePromises = new Map<string, Promise<ClassSnapshot>>();
  private reconcileTimers = new Map<string, number>();

  async signIn(email: string, password: string, create = false) {
    await request(create ? "/auth/signup" : "/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }
  async signOut() {
    await request("/auth/logout", { method: "POST" });
  }
  async getClasses() {
    return (await request<{ classes: ClassRoom[] }>("/classes")).classes;
  }
  async getAllProgress(query = "") {
    return request<{ rows: AllClassProgressRow[]; total: number; page: number; pageSize: number }>(`/all-students/progress${query ? `?${query}` : ""}`);
  }
  async getParticipationActions(classId: string, query: string) {
    return (await request<{ actions: ParticipationAction[] }>(`/classes/${classId}/participation-actions${query ? `?${query}` : ""}`)).actions;
  }
  async updateParticipationAction(classId: string, eventId: string, type: "part+" | "part-") {
    await request(`/classes/${classId}/events/${eventId}`, { method: "PATCH", body: JSON.stringify({ type }) });
  }
  async deleteParticipationAction(classId: string, eventId: string) {
    await request(`/classes/${classId}/events/${eventId}`, { method: "DELETE" });
  }
  async getTimer(classId: string) {
    return (await request<{ timer: ClassTimer | null }>(`/classes/${classId}/timer`)).timer;
  }
  async timerAction(classId: string, action: "start" | "pause" | "resume" | "stop" | "add-time", body?: unknown) {
    return (await request<{ timer: ClassTimer }>(`/classes/${classId}/timer/${action}`, { method: "POST", body: JSON.stringify(body ?? {}) })).timer;
  }
  async getReport(classId: string, query: string) {
    return request<ClassReport>(
      `/classes/${classId}/reports${query ? `?${query}` : ""}`,
    );
  }
  async getCalendar(from: string, to: string) {
    return request<{
      classes: ClassRoom[];
      periods: (Period & { className: string })[];
    }>(
      `/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
  }
  async createCalendarDays(body: unknown) {
    return request<{
      created: { id: string; classId: string }[];
      skipped: string[];
    }>("/calendar/days", { method: "POST", body: JSON.stringify(body) });
  }

  async getSnapshot(classId: string, refresh = false) {
    const cached = await db.snapshots.get(classId);
    if (cached && !refresh) {
      void this.reconcile(classId);
      return cached.value;
    }
    return this.reconcile(classId);
  }

  async createClass(name: string) {
    return request<ClassRoom>("/classes", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }
  async joinClass(code: string) {
    return request(`/student/join/${encodeURIComponent(code)}`);
  }
  async selectStudent(code: string, studentId: string) {
    return request(`/student/join/${encodeURIComponent(code)}/select`, {
      method: "POST",
      body: JSON.stringify({ studentId }),
    });
  }
  async getStudentView() {
    return request("/student/me");
  }
  async studentAction(
    path: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    body?: unknown,
  ) {
    return request(`/student${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async mutate(
    classId: string,
    path: string,
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    body?: unknown,
  ) {
    const cached = await db.snapshots.get(classId);
    if (!cached) throw new Error("Open the class before making changes.");
    const change: PendingChange = {
      id: crypto.randomUUID(),
      method,
      path,
      body,
      createdAt: Date.now(),
    };
    await db.outbox.add(change);
    await this.refreshSyncStatus();
    const value = applyOptimisticChange(cached.value, path, method, body);
    await db.snapshots.put({ classId, value, updatedAt: Date.now() });
    this.emit(classId, value);
    void this.sync();
    return value;
  }

  markAttendance(
    classId: string,
    periodId: string,
    studentId: string,
    status: AttendanceStatus,
  ) {
    return this.mutate(
      classId,
      `/classes/${classId}/attendance/${studentId}`,
      "PUT",
      { periodId, studentId, status },
    );
  }
  async setPeriodAttendance(classId: string, periodId: string, status: AttendanceStatus, studentIds?: string[]) {
    await request(`/classes/${classId}/periods/${periodId}/attendance`, {
      method: "PUT",
      body: JSON.stringify({ status, studentIds }),
    });
    return this.reconcile(classId);
  }
  async completeAttendance(classId: string, periodId: string) {
    await request(`/classes/${classId}/periods/${periodId}/attendance/complete`, { method: "POST" });
    return this.reconcile(classId);
  }
  async finishPeriod(classId: string, periodId: string, confirmAttendanceIncomplete = false) {
    await request(`/classes/${classId}/periods/${periodId}/finish`, {
      method: "POST",
      body: JSON.stringify({ confirmAttendanceIncomplete }),
    });
    return this.reconcile(classId);
  }
  addParticipation(
    classId: string,
    periodId: string,
    studentId: string,
    amount: 1 | -1,
  ) {
    return this.mutate(classId, `/classes/${classId}/events`, "POST", {
      periodId,
      studentId,
      type: amount === 1 ? "part+" : "part-",
    });
  }
  setMastery(
    classId: string,
    studentId: string,
    skillId: string,
    update: { achievement?: Achievement; requiresSupport?: boolean; note?: string },
    assessedAt: string,
    periodId?: string,
  ) {
    return this.mutate(
      classId,
      `/classes/${classId}/mastery/${studentId}/${skillId}`,
      "PUT",
      { studentId, skillId, ...update, assessedAt, periodId },
    );
  }
  async reorderSkills(classId: string, skillIds: string[]) {
    await request(`/classes/${classId}/skills/reorder`, {
      method: "PUT",
      body: JSON.stringify({ skillIds }),
    });
    return this.reconcile(classId);
  }
  cloneSkills(
    destinationClassId: string,
    sourceClassId: string,
    mode: "merge" | "replace",
  ) {
    return request<{
      mode: "merge" | "replace";
      created: number;
      skipped: number;
      removed: number;
    }>(`/classes/${destinationClassId}/skills/clone`, {
      method: "POST",
      body: JSON.stringify({ sourceClassId, mode }),
    });
  }
  async getSkillPhotos(classId: string, studentId: string, skillId?: string) {
    const query = new URLSearchParams({ studentId });
    if (skillId) query.set("skillId", skillId);
    return (await request<{ photos: SkillPhoto[] }>(`/classes/${classId}/photos?${query}`)).photos;
  }
  async uploadSkillPhoto(classId: string, studentId: string, skillId: string, file: Blob, options: { filename?: string; periodId?: string; assessedAt: string }) {
    const headers: Record<string, string> = { "Content-Type": file.type || "image/jpeg", "X-Assessed-At": options.assessedAt };
    if (options.filename) headers["X-Filename"] = options.filename;
    if (options.periodId) headers["X-Period-Id"] = options.periodId;
    this.uploadCount += 1;
    this.publishSyncStatus();
    try {
      const photo = await request<SkillPhoto>(`/classes/${classId}/students/${studentId}/skills/${skillId}/photos`, { method: "POST", headers, body: file });
      this.networkUnavailable = false;
      return photo;
    } catch (error) {
      if (!(error instanceof RequestError)) this.networkUnavailable = true;
      throw error;
    } finally {
      this.uploadCount -= 1;
      this.publishSyncStatus();
    }
  }
  async deleteSkillPhoto(classId: string, photoId: string) {
    await request(`/classes/${classId}/photos/${photoId}`, { method: "DELETE" });
  }
  async requestAction(classId: string, requestId: string, action: "acknowledge" | "resolve" | "cancel" | "restore") {
    await request(`/classes/${classId}/requests/${requestId}/${action}`, { method: "POST" });
    return this.reconcile(classId);
  }
  async acknowledgeNextRequest(classId: string) {
    await request(`/classes/${classId}/requests/next`, { method: "POST" });
    return this.reconcile(classId);
  }

  async sync() {
    if (this.syncPromise) return this.syncPromise;
    this.syncPromise = this.flushOutbox();
    try {
      await this.syncPromise;
    } finally {
      this.syncPromise = undefined;
      await this.refreshSyncStatus();
    }
  }

  private async flushOutbox() {
    while (true) {
      const change = await db.outbox.filter((item) => item.failedAt === undefined).sortBy("createdAt").then((items) => items[0]);
      if (!change) return;
      try {
        await request(change.path, {
          method: change.method,
          body:
            change.body === undefined ? undefined : JSON.stringify(change.body),
        });
        await db.outbox.delete(change.id);
        this.networkUnavailable = false;
        this.syncAttempts = 0;
        await this.refreshSyncStatus();
      } catch (error) {
        if (
          error instanceof RequestError &&
          error.status >= 400 &&
          error.status < 500 &&
          ![408, 429].includes(error.status)
        ) {
          await db.outbox.update(change.id, {
            failedAt: Date.now(),
            error: error.message,
            status: error.status,
          });
          await this.refreshSyncStatus();
          await this.refreshAuthoritativeSnapshot(change.path).catch(() => undefined);
          continue;
        }
        this.networkUnavailable = true;
        await this.refreshSyncStatus();
        window.clearTimeout(this.syncRetry);
        this.syncRetry = window.setTimeout(() => void this.sync(), Math.min(30_000, 1000 * 2 ** this.syncAttempts++));
        return;
      }
    }
  }

  subscribe(classId: string, listener: Listener) {
    const listeners = this.listeners.get(classId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(classId, listeners);
    this.connectSocket();
    return () => {
      listeners.delete(listener);
      this.updateSocketSubscriptions();
    };
  }
  subscribeRequestUpdates(classId: string, listener: RequestListener) {
    const listeners = this.requestListeners.get(classId) ?? new Set<RequestListener>();
    listeners.add(listener);
    this.requestListeners.set(classId, listeners);
    this.connectSocket();
    return () => {
      listeners.delete(listener);
      this.updateSocketSubscriptions();
    };
  }

  getSyncStatus() { return this.syncStatus; }
  subscribeSyncStatus(listener: (status: SyncStatus) => void) {
    this.syncListeners.add(listener);
    listener(this.syncStatus);
    void this.refreshSyncStatus();
    return () => this.syncListeners.delete(listener);
  }
  hasUnsavedChanges() { return this.syncStatus.pendingCount > 0 || this.syncStatus.failed.length > 0 || this.uploadCount > 0; }
  async retryChange(id: string) {
    await db.outbox.update(id, { failedAt: undefined, error: undefined, status: undefined });
    this.networkUnavailable = false;
    await this.refreshSyncStatus();
    await this.sync();
  }
  async discardChange(id: string) {
    const change = await db.outbox.get(id);
    await db.outbox.delete(id);
    await this.refreshSyncStatus();
    if (change) await this.refreshAuthoritativeSnapshot(change.path);
  }

  private async refreshSyncStatus() {
    const changes = await db.outbox.orderBy("createdAt").toArray();
    const failed = changes.filter((change) => change.failedAt !== undefined);
    const pendingCount = changes.length - failed.length;
    this.syncStatus = {
      state: failed.length ? "needs-attention" : this.networkUnavailable && pendingCount ? "offline" : pendingCount || this.uploadCount ? "saving" : "saved",
      pendingCount,
      failed,
    };
    this.syncListeners.forEach((listener) => listener(this.syncStatus));
  }
  private publishSyncStatus() {
    const state = this.syncStatus.failed.length ? "needs-attention" : this.networkUnavailable && this.syncStatus.pendingCount ? "offline" : this.syncStatus.pendingCount || this.uploadCount ? "saving" : "saved";
    this.syncStatus = { ...this.syncStatus, state };
    this.syncListeners.forEach((listener) => listener(this.syncStatus));
  }

  private async reconcile(classId: string) {
    const existing = this.reconcilePromises.get(classId);
    if (existing) return existing;
    const reconcile = (async () => {
      await this.sync();
      const authoritative = await request<ClassSnapshot>(`/classes/${classId}/snapshot`);
      const changes = await db.outbox.orderBy("createdAt").toArray();
      const value = reconcileOptimisticSnapshot(authoritative, changes, classId);
      await db.snapshots.put({ classId, value, updatedAt: Date.now() });
      this.emit(classId, value);
      return value;
    })();
    this.reconcilePromises.set(classId, reconcile);
    try { return await reconcile; }
    finally { this.reconcilePromises.delete(classId); }
  }
  private async refreshAuthoritativeSnapshot(path: string) {
    const classId = classIdFromPath(path);
    if (!classId) return;
    const authoritative = await request<ClassSnapshot>(`/classes/${classId}/snapshot`);
    const changes = await db.outbox.orderBy("createdAt").toArray();
    const value = reconcileOptimisticSnapshot(authoritative, changes, classId);
    await db.snapshots.put({ classId, value, updatedAt: Date.now() });
    this.emit(classId, value);
  }
  private emit(classId: string, value: ClassSnapshot) {
    this.listeners.get(classId)?.forEach((listener) => listener(value));
  }
  private subscribedClassIds() {
    return new Set([...this.listeners, ...this.requestListeners].filter(([, listeners]) => listeners.size).map(([classId]) => classId));
  }
  private connectSocket() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      this.updateSocketSubscriptions();
      return;
    }
    if (!this.subscribedClassIds().size) return;
    this.socketClosedIntentionally = false;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(`${protocol}//${location.host}/ws`);
    this.socket.onopen = () => {
      this.socketAttempts = 0;
      this.updateSocketSubscriptions();
    };
    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as { type?: string; classId?: string } | RequestUpdatedMessage;
        if (message.type === "connected") return;
        if (message.type === "request-updated") {
          const update = message as RequestUpdatedMessage;
          this.requestListeners.get(update.classId)?.forEach((listener) => listener(update));
          if (this.listeners.has(update.classId)) this.scheduleReconcile(update.classId);
          return;
        }
        if (!message.classId || !this.listeners.has(message.classId)) return;
        this.scheduleReconcile(message.classId);
      } catch { /* Ignore malformed messages. */ }
    };
    this.socket.onclose = () => {
      this.socket = undefined;
      if (this.socketClosedIntentionally || !this.subscribedClassIds().size) return;
      const delay = Math.min(30_000, 500 * 2 ** this.socketAttempts++);
      window.clearTimeout(this.socketRetry);
      this.socketRetry = window.setTimeout(() => this.connectSocket(), delay);
    };
  }
  private updateSocketSubscriptions() {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    for (const classId of this.subscribedClassIds()) this.socket.send(JSON.stringify({ type: "subscribe", classId }));
    if (!this.subscribedClassIds().size) {
      this.socketClosedIntentionally = true;
      this.socket.close();
    }
  }
  private scheduleReconcile(classId: string) {
      window.clearTimeout(this.reconcileTimers.get(classId));
      this.reconcileTimers.set(classId, window.setTimeout(() => {
        this.reconcileTimers.delete(classId);
        void this.reconcile(classId).catch(() => undefined);
      }, 250));
  }
}

function classIdFromPath(path: string) {
  return /^\/classes\/([^/]+)/.exec(path)?.[1];
}

export function reconcileOptimisticSnapshot(
  authoritative: ClassSnapshot,
  changes: PendingChange[],
  classId: string,
) {
  return changes
    .filter((change) => change.failedAt === undefined && classIdFromPath(change.path) === classId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .reduce(
      (value, change) => applyOptimisticChange(value, change.path, change.method, change.body),
      authoritative,
    );
}

export function applyOptimisticChange(
  snapshot: ClassSnapshot,
  path: string,
  method: string,
  raw: unknown,
): ClassSnapshot {
  const next = structuredClone(snapshot);
  const body = (raw ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  if (path.includes("/attendance/")) {
    next.attendance = next.attendance.filter(
      (a) => !(a.periodId === body.periodId && a.studentId === body.studentId),
    );
    next.attendance.push({
      periodId: String(body.periodId),
      studentId: String(body.studentId),
      status: body.status as AttendanceStatus,
    });
  } else if (path.endsWith("/events")) {
    next.events.push({
      id: crypto.randomUUID(),
      classId: next.classRoom.id,
      studentId: String(body.studentId),
      periodId: String(body.periodId),
      type: body.type as "part+" | "part-" | "request",
      timestamp: now,
      requestTypeId: body.requestTypeId as string | undefined,
    });
  } else if (path.includes("/mastery/")) {
    const current = next.mastery.find(
      (m) => m.studentId === body.studentId && m.skillId === body.skillId,
    );
    next.mastery = next.mastery.filter(
      (m) => !(m.studentId === body.studentId && m.skillId === body.skillId),
    );
    next.mastery.push({
      studentId: String(body.studentId),
      skillId: String(body.skillId),
      achievement: (body.achievement ?? current?.achievement ?? "not_started") as import("./types").Achievement,
      requiresSupport: body.requiresSupport === undefined ? (current?.requiresSupport ?? false) : Boolean(body.requiresSupport),
      updatedAt: String(body.assessedAt ?? now),
    });
  } else if (/\/classes\/[^/]+$/.test(path) && method === "PATCH") {
    if (body.activeLens === "participation" || body.activeLens === "skills")
      next.classRoom.activeLens = body.activeLens;
    if (typeof body.name === "string") next.classRoom.name = body.name;
  } else if (path.endsWith("/settings") && method === "PUT") {
    next.classRoom.settings = {
      ...next.classRoom.settings,
      ...body,
    } as ClassRoom["settings"];
  } else if (path.endsWith("/seating/reset") && method === "POST") {
    next.students = next.students.map((student) => ({ ...student, x: undefined, y: undefined }));
  } else if (path.includes("/students/") && method === "PATCH") {
    const studentId = path.split("/students/")[1];
    next.students = next.students.map((student) =>
      student.id === studentId
          ? {
              ...student,
              ...(typeof body.displayName === "string" ? { displayName: body.displayName } : {}),
              ...(body.avatar && typeof body.avatar === "object" ? { avatar: body.avatar as import("./types").Student["avatar"] } : {}),
              ...(Array.isArray(body.tags) ? { tags: body.tags as string[] } : {}),
              ...(typeof body.archived === "boolean" ? { archived: body.archived, archivedAt: body.archived ? now : null } : {}),
              ...(typeof body.enrolledAt === "string" ? { enrolledAt: body.enrolledAt } : {}),
              ...(typeof body.x === "number" ? { x: body.x } : {}),
            ...(typeof body.y === "number" ? { y: body.y } : {}),
          }
        : student,
    );
  } else if (path.includes("/students") && method === "POST") {
    const names = (body.names as string[] | undefined) ?? [
      String(body.displayName),
    ];
    names
      .filter(Boolean)
      .forEach((displayName, index) =>
        next.students.push({
          id: `${crypto.randomUUID()}-${index}`,
          classId: next.classRoom.id,
          displayName,
          avatar: { emoji: "●", color: "#E9A23B", shape: "circle" },
          tags: [],
          archived: false,
        }),
      );
  }
  return next;
}

export const dataStore: DataStore = new BrowserDataStore();
