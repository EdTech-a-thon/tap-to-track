# 01 — Prefactor: page shell, domain module, test seam

**What to build:** No new user-facing behaviour. The single-page app becomes three
pages — Chart, Setup, Analytics — with navigation between them. The pure domain module
that the project's single test seam lives in is created, along with a test runner and
one real rule under test to prove the wiring end to end. The old on-device store is
deleted; its data is not migrated.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Chart, Setup and Analytics are separate routes and a teacher can move between them
- [ ] A domain module exists containing plain functions with no database, component or browser dependency
- [ ] A test runner is wired up and at least one domain rule is covered by a passing test
- [ ] The old on-device store is gone and nothing imports it
- [ ] Type checking passes
