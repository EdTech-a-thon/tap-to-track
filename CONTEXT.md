# Tap-to-Track

A touch-first tool for recording what happens in a classroom as it happens: a teacher
taps a student on a seating chart and records a behavior, without breaking the flow of
the lesson.

## Language

### The room

**Layout**:
The arrangement of Seats in a physical room. Describes furniture, not people — it holds
no students and is shared by every Class that meets in the room.
_Avoid_: seating chart, chart

**Seat**:
One position in a Layout. May be empty.
_Avoid_: desk, spot

**Anchor**:
A labelled box in the Layout that is not a Seat — the door, the board, the teacher's own
desk. Holds nobody, records nothing, and is there only so the chart faces the same way the
teacher does. Sized freely, since a board is not desk-shaped.
_Avoid_: marker, landmark, label, note

**Assignment**:
Which Student occupies which Seat, for one Class. Changes freely without altering the
Layout.
_Avoid_: seating, placement

### The people and the meeting

**Class**:
A roster of Students that meets repeatedly. "Period 2 Algebra."
_Avoid_: section, period, course, roster

**Student**:
One learner on a Class roster, known by a first name and enough of a last name to tell
them apart from anyone else in the room.
_Avoid_: learner, kid, pupil

**Day**:
The scope a Tap is counted in on the chart. Counts and toggles cover the teacher's own
calendar day and start clean the next morning — there is nothing to open or close. See
ADR 0004.
_Avoid_: session, period, lesson

### The tracking

**Behavior**:
One thing a teacher tracks by tapping — participation, positive behavior, a redirect,
being absent. Defined once for the whole app; each Class chooses which ones appear on
its popup, but every Behavior is counted everywhere. There is no separate attendance
concept: absence is a Behavior like any other.
_Avoid_: metric, thing, tag, action, attendance

**Tallies / Toggles**:
The two modes a Behavior can be set to. A tallying Behavior counts every tap, so three
taps mean it happened three times. A toggling Behavior is either on or off for the whole
day, so tapping it again turns it back off rather than counting again.
_Avoid_: cumulative, sticky, one-shot

**Tap**:
One recorded event: a Student, a Behavior, a moment in time. The unit of everything
stored and everything counted.
_Avoid_: mark, point, count, hit

**Highlight**:
The one Behavior currently colouring the Seats in the chart, so a teacher can see at a
glance who has and hasn't been marked today. Chosen on the chart itself, and
shaded by how many times a Student has been marked, not merely whether they have.
_Avoid_: filter, overlay

**Unseated**:
A Student on a Class roster with no Seat. Still tappable, still counted — the room
running out of desks never stops a child being tracked.
_Avoid_: unplaced, floating
