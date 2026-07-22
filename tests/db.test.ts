import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../server/db";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function structuralSnapshot(db: ReturnType<typeof createDatabase>) {
  return {
    versions: db
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all()
      .map((row) => (row as { version: number }).version),
    mastery: db.prepare("PRAGMA table_info(mastery)").all().map((row) => (row as { name: string }).name),
    period: db.prepare("PRAGMA table_info(periods)").all().map((row) => (row as { name: string }).name),
    request: db.prepare("PRAGMA table_info(requests)").all().map((row) => (row as { name: string }).name),
    timer: db.prepare("PRAGMA table_info(class_timers)").all().map((row) => (row as { name: string }).name),
    tenantIndexes: db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%tenant%' ORDER BY name").all().map((row) => (row as { name: string }).name),
    integrity: (db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check,
  };
}

describe("database migrations", () => {
  it("create the current schema in memory", () => {
    const db = createDatabase(":memory:");
    const schema = structuralSnapshot(db);
    expect(schema.versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(schema.mastery).toEqual(expect.arrayContaining(["achievement", "requiresSupport"]));
    expect(schema.mastery).not.toContain("state");
    expect(schema.period).toEqual(expect.arrayContaining(["status", "attendanceCompletedAt", "reopenedAt"]));
    expect(schema.request).toEqual(expect.arrayContaining(["status", "acknowledgedAt", "resolvedAt", "cancelledAt"]));
    expect(schema.timer).toEqual(expect.arrayContaining(["status", "durationSeconds", "endsAt", "remainingSeconds", "revision", "updatedAt"]));
    expect(schema.tenantIndexes).toHaveLength(7);
    expect(schema.integrity).toBe("ok");
    db.close();
  });

  it("are idempotent on a persistent database", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tap-db-migrations-"));
    directories.push(directory);
    const path = join(directory, "test.db");
    const first = createDatabase(path);
    const expected = structuralSnapshot(first);
    first.close();
    const reopened = createDatabase(path);
    expect(structuralSnapshot(reopened)).toEqual(expected);
    reopened.close();
  });
});
