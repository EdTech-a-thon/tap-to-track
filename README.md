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

## Local development

Requirements: Node 22+ or Bun 1.3+ and native build tools supported by `better-sqlite3`.

```bash
cp .env.example .env
bun install
bun run dev
```

Run checks with `bun run test` and `bun run build`.

## Production and self-hosting

1. Point a public HTTPS domain at the host.
2. Copy `.env.example` to `.env` and set a long random `SESSION_SECRET`.
3. Set `BASE_URL` and `ALLOWED_ORIGINS` to the public HTTPS origin.
4. Install dependencies and build with `bun install --frozen-lockfile && bun run build`.
5. Install PM2 (`npm install --global pm2`), start with `pm2 start ecosystem.config.cjs`, then save the process list with `pm2 save`.
6. Put an HTTPS reverse proxy in front of the configured `PORT`, preserving WebSocket upgrade headers and `X-Forwarded-Proto`.

Environment variables:

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP listener, defaults to 8000 |
| `BASE_URL` | Canonical public URL, including HTTPS |
| `ALLOWED_ORIGINS` | Comma-separated browser origins allowed to call the app |
| `SESSION_SECRET` | At least 24 characters; signs cookies and student access |
| `DB_PATH` | SQLite file location |
| `NODE_ENV` | Use `production` to serve the built app and secure cookies |

No secrets or database files should be committed. Back up both the SQLite file and teacher-generated JSON exports. Restart with `pm2 restart tap-to-track`; inspect status with `pm2 status`.

## Privacy boundary

Do not enter legal names, student emails, dates of birth, SIS identifiers, or other student PII. The roster template intentionally accepts only go-by display names and optional constrained avatars. Student routes return only the selected student's check-in, requests, and teacher-approved skill progress.

## License

Apache License 2.0. See `LICENSE.txt`.
