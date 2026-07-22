# Tap-to-Track Decisions

## Product and interaction

- Participation uses a split tile with a large green Positive target and a smaller amber Redirect target. This avoids delayed or accidental double-taps, keeps both actions visible, and supports reliable one-handed use. The live coverage bar shows who has not participated, and Undo last removes the actual event rather than adding a counterbalancing mark.
- Participation events are created only by the explicit Positive or Redirect buttons. Tapping a student's avatar, name, status summary, or card background never creates a participation event.
- Every new class starts with today's active period and three request types: Need help, Bathroom, and Done. This makes a new class immediately usable.
- New period is the soft reset. It archives the active period and creates a new one without deleting evidence.
- The classroom map is a simple draggable canvas. Room anchors and more advanced seating-map tools remain a V2 refinement.
- The server's export endpoints are canonical. The browser also offers local exports for fast access when connectivity is unreliable.

## Privacy and security

- Student identity remains a class-local display name and constrained avatar. No legal-name, email, birth-date, SIS-ID, or free-text profile fields exist.
- Student self-selection creates a short-lived, HTTP-only access cookie. All subsequent student reads are server-filtered to that student.
- Student queue positions count only present students, so absent students are excluded from attention lanes.
- Password reset is a fast-follow because it requires an SMTP provider and operational email configuration. V1 includes signup, login, and logout only.

## Deployment

- Teacher app, student app, API, and WebSocket use one origin and one Node process.
- The HTTPS student experience is enabled and not feature-flagged because the configured EdTech-a-thon domain provides public HTTPS.
- SQLite uses WAL mode. Last-write-wins is appropriate because one teacher owns a class's instructional state.
