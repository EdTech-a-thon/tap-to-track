# 05 — Layout mode

**What to build:** A teacher draws their room. On the Chart page, Layout mode lets them
add Seats, drag them into position and delete them. Seats snap to a grid so rows come out
straight, and snapping can be released for a desk that does not sit on the grid. There is
one Layout shared by all of that teacher's Classes (ADR 0002), and it persists.

Deliberately excluded: the warning shown when deleting an occupied Seat. Until
Assignments exist no Seat can be occupied, so it belongs to ticket 06.

**Blocked by:** 02 — PocketBase running, teachers can sign up

**Status:** ready-for-agent

- [ ] A teacher can add a Seat, drag it, and delete it
- [ ] Dragging snaps to a grid by default
- [ ] Snapping can be turned off and a Seat placed freely
- [ ] The Layout survives a reload and is the same whichever Class is selected
- [ ] Snapping and drag-position rules are covered by domain tests
