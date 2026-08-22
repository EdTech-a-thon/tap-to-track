# 14 — Docs and demo account

**What to build:** The project's own documentation currently promises that the app has no
database and that rosters never leave the device. Both stopped being true in ticket 02.
This ticket makes the README and the decisions record describe the app as it now is,
keeping the promise that does still hold: only classroom display names are stored, never
full names or student identifiers. It also seeds a demo account with a fake Class, so the
deployed site can be shown to someone without a login wall being the whole experience.

**Blocked by:** 13 — CSV export

**Status:** ready-for-agent

- [ ] The README describes accounts, the database, the seating chart, analytics and export
- [ ] The decisions record no longer claims data stays on the device
- [ ] The display-names-only promise is stated explicitly and is still true
- [ ] A demo account with a fake Class, Layout and Tap history exists and its credentials are documented
- [ ] No real or realistic student data is used in the demo
