# 09 — Highlight shading

**What to build:** A teacher can read the room at a glance. A picker on the chart chooses
which Behavior colours the Seats, and each Seat is shaded by how many times that Student
has been marked in the open Session — so the child called on six times does not look like
the one called on once. Absent Students stay dark grey whatever is selected. The choice is
remembered per Class.

**Blocked by:** 08 — The popup and Tap rows

**Status:** ready-for-agent

- [ ] A picker on the chart selects which Behavior is highlighted
- [ ] Seats shade in four steps: unmarked, one, two, three-or-more at full colour
- [ ] Shading uses the Behavior's own colour
- [ ] Absent Students show dark grey regardless of what is highlighted
- [ ] The choice is remembered per Class between visits
- [ ] Starting a Session returns every Seat to unmarked
- [ ] The count-to-shade rule and the absent override are covered by domain tests
