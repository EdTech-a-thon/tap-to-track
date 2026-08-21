# 03 — Classes and roster import

**What to build:** A teacher can create Classes and fill them with Students. Names go in
either by pasting a list or by uploading a CSV. Because the app stores only a first name
plus up to three letters of a surname, an import that would produce two identical-reading
Students stops and asks the teacher to add letters rather than guessing. Rosters persist
and belong to the signed-in teacher only.

**Blocked by:** 02 — PocketBase running, teachers can sign up

**Status:** ready-for-agent

- [ ] A teacher can create, rename and delete a Class
- [ ] Pasting names one-per-line or comma-separated adds Students
- [ ] Uploading a CSV with a name column adds the same Students as pasting them would
- [ ] An import producing two identical display names is reported and blocked until resolved
- [ ] No full surname is ever stored
- [ ] Students can be added and removed after the initial import
- [ ] Parsing and collision detection are covered by domain tests
