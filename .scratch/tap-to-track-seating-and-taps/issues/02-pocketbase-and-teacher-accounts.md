# 02 — PocketBase running, teachers can sign up

**What to build:** A teacher can create their own account, sign in, and stay signed in
across reloads and on a second device. Their data is theirs alone: nothing this app
stores is readable by another account or by an anonymous visitor. This is the ticket
that replaces on-device storage with a real database (ADR 0001).

**Blocked by:** 01 — Prefactor: page shell, domain module, test seam

**Status:** ready-for-agent

- [ ] The pinned PocketBase version runs locally through the workspace launcher
- [ ] A teacher can sign up, sign out and sign back in
- [ ] The session survives a page reload and works from a second device
- [ ] Every collection carries an owner and its rules are scoped to the signed-in teacher
- [ ] An anonymous request cannot list or read any collection
- [ ] The generated migration is committed; the data directory and binary are not
- [ ] The client reads the SvelteKit-prefixed PocketBase URL variable and the example env file matches
