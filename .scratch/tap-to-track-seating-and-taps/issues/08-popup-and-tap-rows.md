# 08 — The popup and Tap rows

**What to build:** The thing the app is for. During an open Session, tapping a face opens
a large popup showing the Student's name, their counts so far this Session, and one big
button per Behavior enabled for that Class — laid out as a grid sized to the number of
buttons. Pressing a button records a Tap. A tallying Behavior counts every press; a
toggling one flips on and off. A Student marked absent has every other button disabled
until they are marked present again. A toast offers an immediate undo, because tapping the
wrong face in a grid of thirty is inevitable. Tapping with no open Session offers to start
one rather than recording silently.

**Blocked by:** 04 — Behaviors, with per-Class enabling; 06 — Assignment mode; 07 — Sessions

**Status:** ready-for-agent

- [ ] Tapping a Seat or an unseated Student opens the popup
- [ ] The popup shows the Student's name, this Session's counts, and a close button
- [ ] Button layout fits the count of enabled Behaviors: 1x1, 2x1, 3x1, 2x2, and 3x2 for five or six
- [ ] Pressing a tallying Behavior adds one and records a Tap
- [ ] Pressing a toggling Behavior turns it on, and pressing again turns it off
- [ ] An absent Student's other buttons are disabled and the absent toggle stays live
- [ ] Undo removes the Tap that was just recorded
- [ ] Tapping with no open Session offers to start one and records nothing until it is started
- [ ] Tally, toggle, absent-lockout and undo rules are covered by domain tests
