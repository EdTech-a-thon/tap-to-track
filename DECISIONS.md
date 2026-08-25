# Tap-to-Track Decisions

- The app is a seating chart first. Finding a child means looking at where they sit, not
  reading an alphabetical list.
- Drawing the room and seating students are separate jobs in separate modes, so
  rearranging a class never disturbs the furniture. One room layout is shared by every
  class that meets in it.
- Up to six things can be tracked. The limit is deliberate: a popup you have to read is
  a popup that slows down a lesson.
- Each thing tracked either counts every tap or toggles on and off for the lesson.
  Absence toggles, because a child is absent for a whole lesson rather than three times.
- A lesson is started and ended deliberately. Taps outside a lesson are refused rather
  than recorded silently, so a stray tap while setting up the room never becomes data.
- Desk colors can be reset mid-day, so a second lesson with the same class starts on a
  plain chart. Resetting hides today's colors and counts from that moment on; it deletes
  nothing, so the reports still hold every tap, and it asks nothing before doing it.
- Undo deletes the tap. Nothing writes a correction against a tap that was a mistake.
- Every tap is kept as its own record, which is what makes the analytics and export
  possible. Records live in a database rather than on the device, so a cleared browser
  cannot destroy a term's work and the numbers can be read from a second device.
  See `docs/adr/0001-pocketbase-not-localstorage.md`.
- Because taps now depend on the network, they queue locally when it fails and save
  themselves when it returns.
- Each teacher has their own account and can read only their own data.
- Only classroom display names are stored — a first name and at most three letters of a
  surname. Never full names or student identifiers.
- SvelteKit provides the app structure; the interface stays small and approachable.
