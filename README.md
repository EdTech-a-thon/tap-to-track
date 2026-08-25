# Tap and Tally

**[tapandtally.com](https://tapandtally.com)**

Tap and Tally is a touch-first classroom tool. A teacher draws their room once, seats
their students in it, and then taps a face during a lesson to record what happened.
Underneath, every tap is kept, so patterns that are impossible to hold in your head
show up in a table afterwards.

## What it does

- **A seating chart of your actual room.** Say how many desks you have and pick one of
  five ready-made rooms — or start from blank. Then drag desks where they belong; they
  snap to a grid so rows come out straight. The room is drawn once and shared by every
  class you teach in it — moving a desk never changes who sits where.
- **Anchors for the things that aren't desks.** Add a box for the door, the board or your
  own desk, write in it and size it to fit. They hold nobody and record nothing; they are
  there so the chart faces the same way you do.
- **Seating separate from the room.** Drag a student onto a desk; drop them on a taken
  one to swap. Each class has its own seating on the same furniture.
- **Up to six things to track.** Participation, positive behavior, redirect and absent
  come as defaults. Each one counts every tap, or toggles on and off for the day.
  Each class chooses which appear on its buttons.
- **A day at a time.** There is nothing to start or end. Counts and on/off marks cover
  today and start clean tomorrow, and every tap is stored with the moment it happened.
- **Full screen.** One button fills the screen with just the room, for teaching.
- **Tap a face, press a button.** Counts update instantly, a toast offers an undo, and
  a dropped connection costs you nothing — taps queue and save themselves later.
- **Analytics and export.** Counts per student over the last week, month, or all time,
  filtered by behavior and class, downloadable as a spreadsheet.

## Where things are

`/` is a public homepage explaining the tool — the only server-rendered page, and the
only one that works signed out. The app sits behind the sign-in at `/chart` (the room),
`/setup` (classes, rosters and behaviors) and `/analytics` (the table and the export).
See `docs/adr/0005-a-public-front-door-at-the-root.md`.

## Privacy

Tap and Tally stores a first name and at most three letters of a surname — enough to tell
two Mayas apart, and no more. It never stores full names, student identifiers, photos, or
anything else that identifies a child outside your classroom. Each teacher has their own
account, and nobody else — signed in or not — can read their classes or their students'
records.

## Try it

Sign in with the demo account to look around without creating anything:

```
demo@tapandtally.com
demoteacher
```

The homepage shows the same credentials, so there is nothing to memorise before a demo.

## Development

SvelteKit and Bun on the front, PocketBase behind it.

```bash
bun install
../scripts/agent-dev.mjs /absolute/path/to/tap-to-track
```

That starts the site and its database together on free ports. On a fresh database, run
`node scripts/seed-demo.mjs <pocketbase-url>` to rebuild the demo account.

- `bun run check` — type checking
- `bun run test` — the domain tests
- `bun run build` — a production build

The design behind the code is written down: `CONTEXT.md` (what the words mean),
`docs/adr/` (the decisions worth explaining), and `docs/specs/` (what was built and why).

## License

Apache License 2.0. See `LICENSE.txt`.
