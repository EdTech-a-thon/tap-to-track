# 07 — Sessions

**What to build:** A teacher starts and ends a lesson deliberately. Starting a class picks
the Class, opens a Session and shows a banner with elapsed time; ending it closes the
Session. Starting a Session closes one that was left open, and an ended Session cannot be
reopened — so the record of what happened in a lesson has honest boundaries.

**Blocked by:** 03 — Classes and roster import

**Status:** ready-for-agent

- [ ] A teacher can start a Session for a chosen Class
- [ ] An open Session shows a banner with elapsed time and a way to end it
- [ ] Ending a Session closes it and the banner goes away
- [ ] Starting a Session while one is open closes the previous one
- [ ] An ended Session cannot be reopened
- [ ] Session state rules are covered by domain tests
