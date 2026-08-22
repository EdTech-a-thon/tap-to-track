# No Sessions: a Tap is scoped to the day it happened

Tap-to-Track used to make a teacher start a class and end it. That Session was the scope
for everything on the chart — counts in the popup, toggles like "absent", the shading on
the desks — and every Tap was stored pointing at one.

It earned none of that. Analytics reports rolling windows (last week, last month, all
time) and never counted per Session, so the extra record bought no number anyone reads.
What it cost was two presses at the exact moment a teacher has least attention to spare,
a lesson silently absorbed into yesterday's when someone forgot to end it, and a
prompt-to-start dialog standing between a tap and the child it was about.

Taps now carry only the moment they happened, and the chart scopes to the teacher's own
calendar day: today's counts, today's toggles, clean tomorrow morning. Full screen is
just a view, with nothing to open or close behind it.

## Consequences

Two lessons with the same Class on one day share a chart — the second one opens showing
the first one's counts rather than starting clean, and a student marked absent in the
morning reads absent in the afternoon. No per-lesson statistic is possible from the data
alone. If a lesson ever needs to be a unit again, it is derived from Tap timestamps and
the timetable, not recorded by hand: every Tap keeps the minute it was pressed.
