import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function createDatabase(path = process.env.DB_PATH || "data/tap-to-track.db") {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS teachers (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, passwordHash TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, teacherId TEXT NOT NULL, expiresAt TEXT NOT NULL, FOREIGN KEY(teacherId) REFERENCES teachers(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS classes (id TEXT PRIMARY KEY, teacherId TEXT NOT NULL, name TEXT NOT NULL, activeLens TEXT NOT NULL DEFAULT 'participation', joinCode TEXT UNIQUE NOT NULL, settings TEXT NOT NULL, createdAt TEXT NOT NULL, FOREIGN KEY(teacherId) REFERENCES teachers(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, teacherId TEXT NOT NULL, classId TEXT NOT NULL, displayName TEXT NOT NULL, avatar TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]', archived INTEGER NOT NULL DEFAULT 0, x REAL, y REAL, FOREIGN KEY(classId) REFERENCES classes(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, teacherId TEXT NOT NULL, classId TEXT NOT NULL, label TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', sortOrder INTEGER NOT NULL, visibleToStudents INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(classId) REFERENCES classes(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS mastery (teacherId TEXT NOT NULL, classId TEXT NOT NULL, studentId TEXT NOT NULL, skillId TEXT NOT NULL, state TEXT NOT NULL, updatedAt TEXT NOT NULL, PRIMARY KEY(studentId, skillId));
    CREATE TABLE IF NOT EXISTS periods (id TEXT PRIMARY KEY, teacherId TEXT NOT NULL, classId TEXT NOT NULL, label TEXT NOT NULL, startedAt TEXT NOT NULL, endedAt TEXT, active INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attendance (teacherId TEXT NOT NULL, classId TEXT NOT NULL, periodId TEXT NOT NULL, studentId TEXT NOT NULL, status TEXT NOT NULL, PRIMARY KEY(periodId, studentId));
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, teacherId TEXT NOT NULL, classId TEXT NOT NULL, studentId TEXT NOT NULL, periodId TEXT NOT NULL, type TEXT NOT NULL, requestTypeId TEXT, timestamp TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS request_types (id TEXT PRIMARY KEY, teacherId TEXT NOT NULL, classId TEXT NOT NULL, label TEXT NOT NULL, color TEXT NOT NULL, isAttentionLane INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS request_status (teacherId TEXT NOT NULL, classId TEXT NOT NULL, studentId TEXT NOT NULL, requestTypeId TEXT NOT NULL, joinedAt TEXT NOT NULL, PRIMARY KEY(studentId, requestTypeId));
    CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, teacherId TEXT NOT NULL, classId TEXT NOT NULL, label TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS roster_imports (id TEXT PRIMARY KEY, teacherId TEXT NOT NULL, classId TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_events_owner ON events(teacherId, classId, periodId, studentId);
    CREATE INDEX IF NOT EXISTS idx_students_owner ON students(teacherId, classId);
    CREATE INDEX IF NOT EXISTS idx_attendance_owner ON attendance(teacherId, classId, periodId, studentId);
    CREATE INDEX IF NOT EXISTS idx_mastery_owner ON mastery(teacherId, classId, studentId);
  `);
  const addColumn = (table: string, column: string, definition: string) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  };
  const migrate = (version: number, run: () => void) => {
    if (db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(version)) return;
    db.transaction(() => {
      run();
      db.prepare("INSERT INTO schema_migrations (version, appliedAt) VALUES (?, ?)").run(version, new Date().toISOString());
    })();
  };
  migrate(1, () => addColumn("skills", "parentSkillId", "TEXT"));
  migrate(2, () => {
    addColumn("students", "enrolledAt", "TEXT");
    addColumn("students", "archivedAt", "TEXT");
    addColumn("periods", "type", "TEXT NOT NULL DEFAULT 'instructional'");
    addColumn("periods", "participationExpected", "INTEGER NOT NULL DEFAULT 1");
    addColumn("periods", "teacherNote", "TEXT");
    // Existing learners are treated as enrolled when their class was created (or at its earliest period if unavailable).
    db.exec(`UPDATE students SET enrolledAt = COALESCE(
      (SELECT createdAt FROM classes WHERE classes.id = students.classId),
      (SELECT MIN(startedAt) FROM periods WHERE periods.classId = students.classId),
      CURRENT_TIMESTAMP
    ) WHERE enrolledAt IS NULL`);
    db.exec("UPDATE students SET archivedAt = CURRENT_TIMESTAMP WHERE archived = 1 AND archivedAt IS NULL");
  });
  migrate(3, () => {
    db.exec(`CREATE TABLE IF NOT EXISTS mastery_events (
      id TEXT PRIMARY KEY, teacherId TEXT NOT NULL, classId TEXT NOT NULL, studentId TEXT NOT NULL,
      skillId TEXT NOT NULL, previousState TEXT NOT NULL, state TEXT NOT NULL, timestamp TEXT NOT NULL
    )`);
    db.exec("CREATE INDEX IF NOT EXISTS idx_mastery_events_owner ON mastery_events(teacherId, classId, studentId, timestamp)");
  });
  migrate(4, () => {
    addColumn("periods", "scheduled", "INTEGER NOT NULL DEFAULT 0");
    db.exec("CREATE INDEX IF NOT EXISTS idx_periods_calendar ON periods(teacherId, startedAt, classId)");
  });
  migrate(5, () => {
    addColumn("mastery_events", "periodId", "TEXT");
    addColumn("mastery_events", "skillLabel", "TEXT");
    addColumn("mastery_events", "category", "TEXT");
    addColumn("mastery_events", "derived", "INTEGER NOT NULL DEFAULT 0");
    db.exec(`UPDATE mastery_events SET
      skillLabel = COALESCE(skillLabel, (SELECT label FROM skills WHERE skills.id = mastery_events.skillId)),
      category = COALESCE(category, (SELECT category FROM skills WHERE skills.id = mastery_events.skillId))`);
    db.exec("CREATE INDEX IF NOT EXISTS idx_mastery_events_period ON mastery_events(teacherId, classId, periodId, timestamp)");
  });
  migrate(6, () => {
    db.exec(`CREATE TABLE IF NOT EXISTS skill_evidence_photos (
      id TEXT PRIMARY KEY,
      teacherId TEXT NOT NULL,
      classId TEXT NOT NULL,
      studentId TEXT NOT NULL,
      skillId TEXT NOT NULL,
      periodId TEXT,
      assessedAt TEXT NOT NULL,
      mimeType TEXT NOT NULL,
      storageKey TEXT NOT NULL UNIQUE,
      originalFilename TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(classId) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(skillId) REFERENCES skills(id) ON DELETE CASCADE
    )`);
    db.exec("CREATE INDEX IF NOT EXISTS idx_skill_evidence_photos_owner ON skill_evidence_photos(teacherId, classId, studentId, skillId, assessedAt)");
  });
  migrate(7, () => {
    db.exec(`
      CREATE TABLE mastery_v7 (
        teacherId TEXT NOT NULL, classId TEXT NOT NULL, studentId TEXT NOT NULL, skillId TEXT NOT NULL,
        achievement TEXT NOT NULL, requiresSupport INTEGER NOT NULL DEFAULT 0,
        updatedAt TEXT NOT NULL, PRIMARY KEY(studentId, skillId)
      );
      INSERT INTO mastery_v7 (teacherId, classId, studentId, skillId, achievement, requiresSupport, updatedAt)
      SELECT teacherId, classId, studentId, skillId,
        CASE state WHEN 'none' THEN 'not_started' WHEN 'working' THEN 'approaching' WHEN 'mastered' THEN 'meets'
          WHEN 'not_started' THEN 'not_started' WHEN 'approaching' THEN 'approaching' WHEN 'meets' THEN 'meets'
          WHEN 'exceeds' THEN 'exceeds' ELSE 'not_started' END,
        0, updatedAt
      FROM mastery;
      DROP TABLE mastery;
      ALTER TABLE mastery_v7 RENAME TO mastery;
      CREATE INDEX idx_mastery_owner ON mastery(teacherId, classId, studentId);

      CREATE TABLE mastery_events_v7 (
        id TEXT PRIMARY KEY, teacherId TEXT NOT NULL, classId TEXT NOT NULL, studentId TEXT NOT NULL,
        skillId TEXT NOT NULL, previousAchievement TEXT NOT NULL, achievement TEXT NOT NULL,
        previousRequiresSupport INTEGER NOT NULL DEFAULT 0, requiresSupport INTEGER NOT NULL DEFAULT 0,
        timestamp TEXT NOT NULL, periodId TEXT, skillLabel TEXT, category TEXT
      );
      INSERT INTO mastery_events_v7 (
        id, teacherId, classId, studentId, skillId, previousAchievement, achievement,
        previousRequiresSupport, requiresSupport, timestamp, periodId, skillLabel, category
      )
      SELECT id, teacherId, classId, studentId, skillId,
        CASE previousState WHEN 'none' THEN 'not_started' WHEN 'working' THEN 'approaching' WHEN 'mastered' THEN 'meets'
          WHEN 'not_started' THEN 'not_started' WHEN 'approaching' THEN 'approaching' WHEN 'meets' THEN 'meets'
          WHEN 'exceeds' THEN 'exceeds' ELSE 'not_started' END,
        CASE state WHEN 'none' THEN 'not_started' WHEN 'working' THEN 'approaching' WHEN 'mastered' THEN 'meets'
          WHEN 'not_started' THEN 'not_started' WHEN 'approaching' THEN 'approaching' WHEN 'meets' THEN 'meets'
          WHEN 'exceeds' THEN 'exceeds' ELSE 'not_started' END,
        0, 0, timestamp, periodId, skillLabel, category
      FROM mastery_events WHERE derived = 0;
      DROP TABLE mastery_events;
      ALTER TABLE mastery_events_v7 RENAME TO mastery_events;
      CREATE INDEX idx_mastery_events_owner ON mastery_events(teacherId, classId, studentId, timestamp);
      CREATE INDEX idx_mastery_events_period ON mastery_events(teacherId, classId, periodId, timestamp);

      CREATE TABLE periods_v7 (
        id TEXT PRIMARY KEY, teacherId TEXT NOT NULL, classId TEXT NOT NULL, label TEXT NOT NULL,
        startedAt TEXT NOT NULL, endedAt TEXT, active INTEGER NOT NULL, type TEXT NOT NULL DEFAULT 'instructional',
        participationExpected INTEGER NOT NULL DEFAULT 1, teacherNote TEXT, scheduled INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO periods_v7 (id, teacherId, classId, label, startedAt, endedAt, active, type, participationExpected, teacherNote, scheduled)
      SELECT id, teacherId, classId, label, startedAt, endedAt, active, type, participationExpected, teacherNote, scheduled FROM periods;
      DROP TABLE periods;
      ALTER TABLE periods_v7 RENAME TO periods;
      CREATE INDEX idx_periods_calendar ON periods(teacherId, startedAt, classId);
    `);
  });
  migrate(8, () => {
    addColumn("periods", "status", "TEXT");
    addColumn("periods", "attendanceCompletedAt", "TEXT");
    addColumn("periods", "reopenedAt", "TEXT");
    db.exec(`
      UPDATE periods SET status = CASE
        WHEN scheduled = 1 THEN 'scheduled'
        WHEN active = 1 THEN 'live'
        ELSE 'closed'
      END WHERE status IS NULL;
      UPDATE periods SET status = 'closed', active = 0, scheduled = 0,
        endedAt = COALESCE(endedAt, CURRENT_TIMESTAMP)
      WHERE status = 'live' AND rowid NOT IN (
        SELECT MAX(rowid) FROM periods WHERE status = 'live' GROUP BY teacherId, classId
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_periods_one_live_class
        ON periods(teacherId, classId) WHERE status = 'live';
      CREATE INDEX IF NOT EXISTS idx_periods_status ON periods(teacherId, classId, status, startedAt);
      CREATE TRIGGER IF NOT EXISTS periods_status_insert
        BEFORE INSERT ON periods WHEN NEW.status NOT IN ('scheduled', 'live', 'closed')
        BEGIN SELECT RAISE(ABORT, 'invalid period status'); END;
      CREATE TRIGGER IF NOT EXISTS periods_status_update
        BEFORE UPDATE OF status ON periods WHEN NEW.status NOT IN ('scheduled', 'live', 'closed')
        BEGIN SELECT RAISE(ABORT, 'invalid period status'); END;
    `);
  });
  migrate(9, () => {
    addColumn("request_types", "behavior", "TEXT");
    addColumn("request_types", "resolveLabel", "TEXT");
    db.exec(`
      UPDATE request_types SET behavior = CASE
        WHEN isAttentionLane = 1 THEN 'attention'
        WHEN lower(trim(label)) = 'bathroom' THEN 'presence'
        WHEN lower(trim(label)) = 'done' THEN 'completion'
        ELSE 'custom'
      END WHERE behavior IS NULL;
      UPDATE request_types SET resolveLabel = CASE behavior
        WHEN 'attention' THEN 'Helped'
        WHEN 'presence' THEN 'Returned'
        WHEN 'completion' THEN 'Reviewed'
        ELSE 'Resolve'
      END WHERE resolveLabel IS NULL;

      CREATE TABLE requests (
        id TEXT PRIMARY KEY,
        teacherId TEXT NOT NULL,
        classId TEXT NOT NULL,
        studentId TEXT NOT NULL,
        requestTypeId TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active', 'acknowledged', 'resolved', 'cancelled')),
        joinedAt TEXT NOT NULL,
        acknowledgedAt TEXT,
        resolvedAt TEXT,
        cancelledAt TEXT,
        resolvedBy TEXT,
        updatedAt TEXT NOT NULL
      );
      INSERT INTO requests (id, teacherId, classId, studentId, requestTypeId, status, joinedAt, updatedAt)
      SELECT lower(hex(randomblob(16))), teacherId, classId, studentId, requestTypeId, 'active', joinedAt, joinedAt
      FROM request_status;
      DROP TABLE request_status;

      UPDATE requests SET status = 'cancelled', cancelledAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
      WHERE status = 'active' AND EXISTS (
        SELECT 1 FROM requests newer
        WHERE newer.teacherId = requests.teacherId AND newer.classId = requests.classId
          AND newer.studentId = requests.studentId AND newer.status = 'active'
          AND (newer.joinedAt > requests.joinedAt OR (newer.joinedAt = requests.joinedAt AND newer.rowid > requests.rowid))
      );

      CREATE UNIQUE INDEX idx_requests_one_open_student
        ON requests(teacherId, classId, studentId) WHERE status IN ('active', 'acknowledged');
      CREATE INDEX idx_requests_class_status_type_joined
        ON requests(teacherId, classId, status, requestTypeId, joinedAt);
      CREATE INDEX idx_requests_student
        ON requests(teacherId, classId, studentId, updatedAt);
      CREATE TRIGGER request_types_behavior_insert
        BEFORE INSERT ON request_types WHEN NEW.behavior NOT IN ('attention', 'presence', 'completion', 'custom')
        BEGIN SELECT RAISE(ABORT, 'invalid request behavior'); END;
      CREATE TRIGGER request_types_behavior_update
        BEFORE UPDATE OF behavior ON request_types WHEN NEW.behavior NOT IN ('attention', 'presence', 'completion', 'custom')
        BEGIN SELECT RAISE(ABORT, 'invalid request behavior'); END;
    `);
  });
  migrate(10, () => {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_periods_tenant_time ON periods(teacherId, classId, startedAt);
      CREATE INDEX IF NOT EXISTS idx_events_tenant_time ON events(teacherId, classId, timestamp);
      CREATE INDEX IF NOT EXISTS idx_attendance_tenant_student ON attendance(teacherId, classId, studentId, periodId);
      CREATE INDEX IF NOT EXISTS idx_mastery_tenant_skill ON mastery(teacherId, classId, skillId, studentId);
      CREATE INDEX IF NOT EXISTS idx_mastery_events_tenant_time ON mastery_events(teacherId, classId, timestamp, studentId, skillId);
      CREATE INDEX IF NOT EXISTS idx_requests_tenant_time ON requests(teacherId, classId, joinedAt, studentId);
      CREATE INDEX IF NOT EXISTS idx_photos_tenant_time ON skill_evidence_photos(teacherId, classId, assessedAt, studentId);
    `);
  });
  migrate(11, () => {
    db.exec(`
      CREATE TABLE class_timers (
        teacherId TEXT NOT NULL,
        classId TEXT PRIMARY KEY,
        periodId TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('running', 'paused', 'stopped', 'finished')),
        label TEXT NOT NULL,
        durationSeconds INTEGER NOT NULL,
        endsAt TEXT,
        remainingSeconds INTEGER NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY(classId) REFERENCES classes(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_class_timers_owner ON class_timers(teacherId, classId, periodId);
    `);
  });
  migrate(12, () => {
    addColumn("mastery_events", "note", "TEXT");
  });
  db.exec("DROP TABLE IF EXISTS request_status");
  db.exec(`
    INSERT OR IGNORE INTO attendance (teacherId, classId, periodId, studentId, status)
    SELECT s.teacherId, s.classId, p.id, s.id, 'present'
    FROM students s
    JOIN periods p ON p.teacherId = s.teacherId AND p.classId = s.classId AND p.status = 'live'
    WHERE s.archived = 0;
  `);
  return db;
}

export type AppDatabase = ReturnType<typeof createDatabase>;
