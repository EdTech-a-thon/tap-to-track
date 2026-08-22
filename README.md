# Tap-to-Track

Tap-to-Track is a touch-first classroom tool. A teacher draws their room once, seats
their students in it, and then taps a face during a lesson to record what happened.
Underneath, every tap is kept, so patterns that are impossible to hold in your head
show up in a table afterwards.

## What it does

- **A seating chart of your actual room.** Drag desks where they belong; they snap to a
  grid so rows come out straight. The room is drawn once and shared by every class you
  teach in it — moving a desk never changes who sits where.
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

## Privacy

Tap-to-Track stores a first name and at most three letters of a surname — enough to tell
two Mayas apart, and no more. It never stores full names, student identifiers, photos, or
anything else that identifies a child outside your classroom. Each teacher has their own
account, and nobody else — signed in or not — can read their classes or their students'
records.

## Try it

Sign in with the demo account to look around without creating anything:

```
demo@tap-to-track.example
demoteacher
```

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
