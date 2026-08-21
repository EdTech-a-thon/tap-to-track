# 11 — Offline outbox

**What to build:** A dropped connection never costs a teacher their lesson. A Tap
registers on screen immediately and is queued locally if it cannot be saved, draining
automatically when the connection returns. A badge shows how many Taps are still unsent,
so the teacher knows the app is catching up rather than quietly losing things. This is the
consequence recorded in ADR 0001 of moving off on-device storage.

**Blocked by:** 08 — The popup and Tap rows

**Status:** ready-for-agent

- [ ] A Tap updates the count immediately, before the save completes
- [ ] With the connection cut, taps continue to register and are queued
- [ ] Queued taps save automatically when the connection returns
- [ ] Queued taps survive a page reload
- [ ] A badge shows the number of unsent taps and clears when the queue drains
- [ ] Undo works on a tap that has not been sent yet
