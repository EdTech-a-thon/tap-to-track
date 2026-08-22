# Spec: Seating chart and Tap history

## Problem Statement

A teacher can currently tap a card to record participation or a redirect, but the app
forgets almost everything that matters. The cards are an alphabetical list that looks
nothing like the room, so finding a particular child mid-lesson means reading names
instead of looking up at where they are sitting. Counts live only as running totals on
the student record, so there is no history: a teacher cannot ask how many redirects
Jordan needed this month, cannot see that they have not called on Riley in two weeks,
and cannot take anything out of the app to show a parent or a colleague. Everything is
stored in one browser, so clearing it destroys the term and tapping on a tablet means
the numbers are unreachable from a laptop. What the teacher wants is a picture of their
actual room they can tap during a lesson, and a record underneath it that accumulates.

## Solution

Tap-to-Track becomes a seating chart on top of a real database.

The teacher draws their room once — dragging Seats into position on a computer, with
snapping so rows come out straight. Drawing the room and deciding who sits in it are
separate jobs in separate modes, so re-seating a Class never disturbs the furniture, and
the one Layout is shared by every Class the teacher meets in that room.

They decide what they want to track: up to six Behaviors, each with a name and a colour,
each set either to tally every tap or to toggle on and off for the whole day.
Participation, positive behavior, redirect and absent ship as defaults. Each Class turns
on the subset it uses.

Then they teach. There is nothing to start or end: a Full screen button drops the app
into Teaching mode — full-screen, no chrome, just the room — and the chart shows today,
starting clean each morning. Tapping a face opens a large popup of Behavior buttons;
each press records one Tap as a row that is never overwritten. The chart shades Seats by whichever Behavior is currently
highlighted, so the teacher can see at a glance who has not been heard from.

Afterwards, an analytics table counts Taps per Student over the last week, the last
month, or all time, filtered by Behavior and by Class, and exports exactly what is on
screen as a CSV.

## User Stories

1. As a teacher, I want to sign up for my own account, so that my classes and my
   students' records are mine and not visible to anyone else with the link.
2. As a teacher, I want to sign in on a different device, so that I can tap on a tablet
   during class and read the analytics on my laptop afterwards.
3. As a teacher, I want to create several Classes, so that Period 2 and Period 6 are
   tracked separately.
4. As a teacher, I want to paste a list of names to build a roster, so that I can set up
   a Class from an email in one go.
5. As a teacher, I want to upload a CSV of names, so that I can build a roster from a
   gradebook export without retyping it.
6. As a teacher, I want students stored as a first name plus a letter or two of their
   surname, so that the app holds classroom display names rather than student identities.
7. As a teacher, I want to be told when an import produces two students who would read
   identically, so that I can add letters to tell Maya Ce and Maya Ch apart.
8. As a teacher, I want to add a student to a Class later in the term, so that a new
   enrollee can be tracked from their first day.
9. As a teacher, I want to remove a student from a Class, so that a roster that has
   changed does not clutter the chart.
10. As a teacher, I want to drag Seats into position on a blank canvas, so that the chart
    matches the shape of my actual room rather than a grid I do not have.
11. As a teacher, I want Seats to snap to a grid as I drag them, so that rows come out
    straight without fiddling.
12. As a teacher, I want to switch snapping off, so that I can place a desk that does not
    sit on the grid.
13. As a teacher, I want to add and delete Seats, so that the Layout can grow or shrink
    as my room changes.
14. As a teacher, I want to be warned how many Classes are affected before I delete an
    occupied Seat, so that I do not unseat students in four rosters by accident.
15. As a teacher, I want one Layout shared by all my Classes, so that I draw my room once
    rather than five times.
16. As a teacher, I want a separate Assignment mode, so that moving students around
    cannot accidentally move the furniture.
17. As a teacher, I want to drag a student from a list onto a Seat, so that seating a
    Class is direct and obvious.
18. As a teacher, I want dropping a student onto an occupied Seat to swap the two, so
    that separating two children who cannot sit together is a single action.
19. As a teacher, I want to remove a student from a Seat without deleting them, so that
    they go back to the unseated list rather than off the roster.
20. As a teacher, I want students who have no Seat to appear in a row I can still tap, so
    that running out of desks never stops a child being tracked.
21. As a teacher, I want each Class to keep its own Assignment on the shared Layout, so
    that Period 2 and Period 6 can sit differently in the same room.
22. As a teacher, I want to define up to six Behaviors, so that the popup stays fast
    enough to use without reading it.
23. As a teacher, I want each Behavior to have a colour, so that the chart is readable at
    a glance from across the room.
24. As a teacher, I want to choose whether a Behavior tallies or toggles, so that things
    that happen repeatedly and states that last a day are both recorded honestly.
25. As a teacher, I want participation, positive behavior, redirect and absent to exist
    by default, so that the app is usable before I have configured anything.
26. As a teacher, I want to turn Behaviors on and off per Class, so that a button I never
    press in Period 2 does not slow down Period 2.
27. As a teacher, I want every Behavior counted in analytics regardless of which Class
    shows it, so that the record is complete even where the button is hidden.
28. As a teacher, I want to pick the class I am teaching from a dropdown, so that taps
    are recorded against the right roster.
29. As a teacher, I want the chart to cover today only, so that this morning's lesson
    does not inherit yesterday's colours — and so that nothing has to be started or
    ended for that to be true. See ADR 0004.
30. As a teacher, I want a tap to record the moment I make it, so that nothing stands
    between me and the child it was about.
34. As a teacher, I want tapping a face to open a large popup, so that I can hit it
    without looking while I am teaching.
35. As a teacher, I want the popup laid out as a grid that fits the number of Behaviors,
    so that the buttons are as large as they can be.
36. As a teacher, I want the popup to show the student's counts for today, so that
    I can see what I have already recorded before adding to it.
37. As a teacher, I want a close button on the popup, so that I can dismiss it without
    recording anything.
38. As a teacher, I want each press to record one Tap, so that the history is a list of
    what happened rather than a total I cannot unpick.
39. As a teacher, I want to undo a tap immediately after making it, so that hitting the
    wrong face in a grid of thirty is recoverable.
40. As a teacher, I want to mark a student absent with a tap, so that the room on screen
    matches the room in front of me.
41. As a teacher, I want absent students shown dark grey whatever else the chart is
    showing, so that empty desks never read as neglected children.
42. As a teacher, I want an absent student's other buttons disabled, so that I cannot
    record participation for someone who is not there.
43. As a teacher, I want to un-mark a student absent, so that a late arrival can be
    tracked for the rest of the lesson.
44. As a teacher, I want to choose which Behavior colours the chart, so that I can switch
    between who I have not called on and who has needed redirecting.
45. As a teacher, I want the chart shaded by how many times a student has been marked,
    so that the child I have called on six times does not look like the one I called on
    once.
46. As a teacher, I want my Highlight choice remembered per Class, so that each period
    opens showing what I care about in it.
47. As a teacher, I want a Teaching mode that fills the screen and hides the controls, so
    that during a lesson there is nothing on screen but my room.
48. As a teacher, I want one button to fill the screen with my room, so that getting
    ready to teach is a single action.
49. As a teacher, I want to leave Teaching mode without losing anything, so that
    checking something mid-lesson does not cost me the lesson's record.
50. As a teacher, I want a visible way out of Teaching mode at all times, so that I am
    never stranded in a full-screen app in front of thirty children.
51. As a teacher, I want my taps to register instantly even when the wifi drops, so that
    a bad connection does not cost me a period of data.
52. As a teacher, I want to see that some taps have not been saved yet, so that I know
    the app is catching up rather than silently losing things.
53. As a teacher, I want an analytics table of counts per student, so that I can see
    patterns I cannot hold in my head.
54. As a teacher, I want to switch the table between the last week, the last month and
    all time, so that I can tell a bad fortnight from a bad term.
55. As a teacher, I want to filter the table by Behavior, so that I can look at redirects
    without participation in the way.
56. As a teacher, I want to filter the table by Class, so that I can look at one period
    or several at once.
57. As a teacher, I want a Class column in the table, so that a multi-class view still
    tells me who is who.
58. As a teacher, I want to sort the table by any column, so that I can find the top and
    bottom of a Behavior immediately.
59. As a teacher, I want to export exactly the table I am looking at as a CSV, so that
    what I share matches what I saw.
60. As a teacher, I want to see which students have no taps at all in a window, so that
    the children I overlook are the ones the table makes obvious.

## Implementation Decisions

### Storage and access

- **PocketBase replaces `localStorage` entirely**, per ADR 0001. The browser talks to it
  directly through the PocketBase JS SDK — no server routes proxying calls, per the
  project's PocketBase conventions.
- **Teachers sign up for real accounts.** Every collection carries an `owner` relation to
  the auth collection, and every List/View/Create/Update/Delete rule is scoped to
  `owner = @request.auth.id`. Nothing in this app is publicly listable, because the data
  is named children with behavior records attached.
- A **demo account with a fake Class** is seeded and its credentials recorded in the
  README, so the deployed site can be shown without a login wall blocking a first look.
- Schema changes are made in the local Admin UI and the **generated migration files are
  committed to `pb_migrations/` at the repo root**. Migrations are never hand-authored or
  edited after generation.
- The local binary is **PocketBase 0.39.10**, the version pinned across this workspace.
  `pb_data/` and the binary stay gitignored. The stale `pb_data/` currently in the
  working tree is discarded.
- The client reads **`PUBLIC_POCKETBASE_URL`** — SvelteKit's prefix. `.env.example` is
  corrected from the `VITE_` prefix left over from the app's React era.

### Collections

- **`classes`** — name, owner, plus a multiple relation to the Behaviors enabled for that
  Class. A join collection is not used; the enabled set is small and unordered.
- **`students`** — display name, a relation to one Class, an optional relation to one
  Seat, owner. One Student belongs to exactly one Class, per ADR 0003.
- **`seats`** — x, y, owner. No Class relation: the Layout is a single shared arrangement
  per teacher, per ADR 0002.
- **`behaviors`** — name, colour, mode (`tally` or `toggle`), sort order, owner.
- **`taps`** — relations to one Student and one Behavior, an `at` timestamp, owner. Append-only in normal use; rows are deleted only by Undo and by un-toggling.
  The timestamp is stamped by the app rather than by the database: a Tap belongs to the
  moment the teacher pressed the button, not to whenever the outbox got it through.

### Layout and Assignment

- Seats are stored as **absolute x/y coordinates**, not grid cells, reviving the
  coordinate model from the removed `seating.ts`. Snapping is applied at drag time, not
  at storage time, so a snapped Layout and a free one are the same data.
- **Snapping is on by default** with a toolbar toggle to release it.
- Deleting a Seat **warns with the number of Classes affected**, then unseats the
  occupants in all of them.
- The Layout is sized for the **largest Class**; smaller Classes leave Seats empty.
- Dropping a Student onto an occupied Seat **swaps the two occupants**.
- Students with no Seat appear in an **unseated row** that is tappable exactly like a
  Seat, on the Chart page and in Teaching mode alike.

### Behaviors and Taps

- The Behavior list is **global to the teacher and capped at six**. The cap is a design
  constraint, not a storage one: a popup that must be read is a popup that slows down a
  lesson.
- Each Class enables a subset. That subset controls **only which buttons appear in the
  popup** — analytics and export count every Behavior across every Class.
- A **tallying** Behavior writes a new Tap row per press. A **toggling** Behavior is
  defined by the presence or absence of a row for that day, Student and Behavior:
  pressing it once creates the row, pressing it again deletes it.
- Absent ships as a toggling Behavior coloured dark grey. It is otherwise an ordinary
  Behavior — it occupies one of the six slots and can be renamed or deleted. There is no
  attendance feature and no attendance concept in the schema.
- The popup grid is chosen by the count of enabled Behaviors: 1×1, 2×1, 3×1, 2×2, and
  3×2 for both five and six.
- When a Student is marked absent, **every other Behavior button in their popup is
  disabled** and only the absent toggle stays live, which is how a late arrival is
  switched back on.
- **Undo hard-deletes the row.** No compensating negative rows: they complicate every
  query forever in exchange for an audit trail nobody reads.

### The day

- There is **nothing to start or end.** Counts, toggles and shading cover the teacher's
  own calendar day, and start clean the next morning. See ADR 0004.
- Every Tap keeps the minute it was pressed, so a lesson can be **derived from
  timestamps and a timetable** later if per-lesson numbers are ever wanted.

### Chart, Highlight and modes

- The app is **three pages: Chart, Setup, Analytics.** The Chart page carries three
  modes: Layout, Assignment and Teaching.
- The **Highlight picker lives on the chart**, not in configuration, because switching
  between "who have I not called on" and "who has needed redirecting" is a mid-lesson
  move. The choice is remembered per Class.
- Seats are shaded in **four steps** by today's count: unmarked, one,
  two, three-or-more at full colour. Absent always overrides the Highlight shading.
- **Teaching mode** is full-screen and keeps only the seats, the Class dropdown, the
  Highlight picker and the unseated row. The mode switcher is hidden. A Full screen
  button enters it; Esc and a persistently visible control leave it, and leaving costs
  nothing because nothing was open.

### Offline behaviour

- Taps are **optimistic**: the count updates immediately and the write is queued in a
  local outbox that drains on reconnect. A badge shows the number of unsent Taps.
- This exists because Q1's move to PocketBase made every Tap a network write, and
  classroom wifi fails during lessons — noted as a consequence in ADR 0001.

### Roster import

- Two paths: **paste** (one name per line or comma-separated, as today) and **CSV upload**
  with a name column.
- Names are stored as a **single display string** — a first name plus up to three letters
  of a surname. The full surname is never stored, so collisions are resolved by
  **prompting the teacher to add letters at import time** rather than by disambiguating
  from data the app deliberately does not keep.

### Analytics and export

- One table. Rows are Students, one per Student, with a Class column. Columns are the
  selected Behaviors.
- Filters: a **window** (rolling last 7 days, rolling last 30 days, all time), a
  multi-select of Behaviors, and a multi-select of Classes. Windows are rolling rather
  than calendar, so "this week" on a Monday morning is not an almost-empty column.
- Columns sort on click.
- **Export is a CSV of exactly the table on screen** — same rows, same columns, same
  filters — so what gets shared matches what was seen.

## Testing Decisions

### Prior art

There is none. `tests/` is empty and `package.json` has no test runner, so this spec
establishes the project's first testing seam rather than following an existing one.

### The seam

**One seam: a pure domain module.** Everything in this feature that has a right answer
lives in plain TypeScript functions with no PocketBase client, no Svelte components and
no browser APIs, and is tested directly. The rule for what belongs there is whether a
wrong answer would be a wrong *number* or a wrong *record* — not whether it is on screen.

- Seat snapping: a dragged coordinate resolves to the same snapped coordinate, and
  releasing snapping returns the raw one.
- Drop resolution: dropping onto an empty Seat seats; dropping onto an occupied Seat
  swaps; a Student can only occupy one Seat.
- Seat deletion: reports how many Classes are affected and produces the resulting
  unseated set.
- Roster parsing: pasted text and CSV both yield the same Student list; collisions are
  reported rather than silently merged or auto-expanded.
- Tap resolution: a tallying Behavior accumulates; a toggling Behavior creates on first
  press and deletes on second; an absent Student rejects every Behavior but the absent
  toggle.
- Day scoping: a Tap counts on the calendar day it was pressed, so yesterday's toggles
  and counts never leak into today.
- Highlight shading: counts map to the four shade steps, and absent overrides.
- Analytics aggregation: Taps reduce to per-Student, per-Behavior counts over a rolling
  window, honouring Behavior and Class filters, and Students with zero Taps still appear.
- CSV serialisation: the exported rows and columns match the aggregated table exactly,
  and names containing commas survive the round trip.

**Vitest** drives it — Vite is already the build tool, so it is a one-line addition
rather than a new toolchain.

### What makes a good test here

Tests assert external behavior only: given these Taps and this filter, these counts.
They never assert on how a value was computed, on internal helper calls, or on the shape
of intermediate state. A test that has to be rewritten because a function was renamed or
split is testing the wrong thing.

### Deliberately untested

PocketBase reads and writes, the drag interactions, the popup, and the Teaching-mode
chrome. These are thin enough to verify by hand, and testing them would mean either a
mock of the PocketBase SDK that asserts implementation details, or a browser-level
end-to-end suite. Both cost more than they return on a three-day prototype. The
consequence is real and worth stating: nothing in this plan catches a mistake in an API
rule or a migration, so those are verified manually against a running instance.

## Out of Scope

- **Average Taps per lesson and most Taps in a single lesson.** Named in the original
  request and deliberately dropped in favour of a plain count table. A student with 12
  redirects over 30 lessons and one with 12 over 3 will look identical.
- **Migrating existing saved rosters.** The current `localStorage` data is abandoned, not
  imported.
- **Multiple rooms.** One Layout per teacher; a teacher who moves between two rooms is
  not supported (ADR 0002).
- **A Student in more than one Class.** Co-taught and looping students have split
  histories that no view can total (ADR 0003).
- **Attendance as a concept.** Absence is a Behavior; there is no attendance feature,
  register, or per-Class attendance setting.
- **Per-Class Behavior definitions.** Classes enable and disable from one global list;
  they do not define their own.
- **Sharing a Class between teachers**, real-time sync between two devices watching the
  same chart, and any collaborative editing.
- **Full surnames, student identifiers, photos, and any other identifying data.**
- Printing, PDF export, gradebook or Google Classroom integration, and any export format
  other than a CSV of the visible table.

## Further Notes

- `README.md` and `DECISIONS.md` both currently promise that the app has no database and
  that rosters stay on the device. Both statements become false with this change and must
  be rewritten in the same piece of work — including the promise about display names,
  which this spec keeps and should say so explicitly.
- The vocabulary in this spec is the project glossary in `CONTEXT.md`: Class, Day,
  Layout, Seat, Assignment, Student, Behavior, Tap, Highlight, Unseated, and
  tallies/toggles. "Class" always means the roster that meets repeatedly and never a
  single meeting.
- Four ADRs cover the decisions in this area and should be read before changing them:
  0001 (PocketBase over `localStorage`, and the offline consequence), 0002 (one Layout
  shared by every Class), 0003 (a Student belongs to one Class), 0004 (no Sessions: a Tap
  is scoped to the day it happened).
- Local development runs through `../scripts/agent-dev.mjs`, which starts the project's
  PocketBase automatically once the binary is present and injects
  `PUBLIC_POCKETBASE_URL`. Ports are leased; nothing here should hard-code 8000 or 8090.
- The Layout editor is explicitly a sit-down-at-a-computer job. Only Teaching mode is
  designed for a tablet held in one hand.
