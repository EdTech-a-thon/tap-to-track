# Tap-to-Track

Tap-to-Track is a touch-first classroom tool for attendance, participation, skills evidence, and quiet student requests. It is not a gradebook. Students are represented only by a teacher-chosen display name and constrained visual avatar.

## Features

- Isolated teacher accounts and independent classes
- Fast attendance and participation tracking on one shared tile grid
- Three-state skills checklists and progress matrix
- Period history and CSV, Excel, and JSON exports
- Student self check-in, color-coded requests, and optional self-only progress
- Offline browser cache with queued changes
- Installable PWA and real-time WebSocket updates

## Database

PocketBase stores teacher accounts, classrooms, classroom records, and skill
photos. The browser uses PocketBase directly; teacher ownership is enforced by
collection API rules. Schema changes are committed in `pb_migrations/`, custom
student access lives in `pb_hooks/`, and local data in `pb_data/` is never
committed.

The flexible `class_records` collection holds students, periods, attendance,
participation, skills, mastery, requests, groups, and timers. Its `kind` field
identifies the record type and its `payload` contains the type-specific values.
This keeps the prototype schema small while all records remain indexed and
owned by one classroom.

## Local development

Requirements: Node 22+ or Bun 1.3+.

```bash
cp .env.example .env
bun install
./install-pocketbase.sh
../scripts/agent-dev.mjs /absolute/path/to/tap-to-track
```

Run checks with `bun run test` and `bun run build`.

The shared platform runs PocketBase and applies committed migrations
automatically. `VITE_POCKETBASE_URL` is supplied for the browser in production.
No database files or administrator credentials should be committed.

## Privacy boundary

Do not enter legal names, student emails, dates of birth, SIS identifiers, or other student PII. The roster template intentionally accepts only go-by display names and optional constrained avatars. Student routes return only the selected student's check-in, requests, and teacher-approved skill progress.

## License

Apache License 2.0. See `LICENSE.txt`.
