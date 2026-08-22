# 06 — Assignment mode

**What to build:** A teacher decides who sits where, without disturbing the furniture.
Assignment mode shows the room alongside a list of Students not yet placed; dragging one
onto a Seat seats them, and dropping onto an occupied Seat swaps the two. A Student can
be returned to the unseated list at any time. Each Class has its own Assignment on the
shared Layout. Deleting an occupied Seat now warns with the number of Classes affected
before unseating everyone in it.

**Blocked by:** 03 — Classes and roster import; 05 — Layout mode

**Status:** ready-for-agent

- [ ] Dragging a Student onto an empty Seat seats them
- [ ] Dropping a Student onto an occupied Seat swaps the two Students
- [ ] A Student can be unseated without being removed from the Class
- [ ] Switching Class changes who is in the Seats but never moves a Seat
- [ ] Deleting an occupied Seat warns with the count of affected Classes, then unseats them
- [ ] Students with no Seat appear in an unseated row
- [ ] Seating, swapping and deletion-impact rules are covered by domain tests
