# 13 — CSV export

**What to build:** A teacher can take what they are looking at out of the app. One button
downloads the analytics table exactly as shown — same rows, same columns, same filters and
window — as a CSV, so what gets shared with a colleague or a parent matches what was on
screen.

**Blocked by:** 12 — Analytics table

**Status:** ready-for-agent

- [ ] The export contains the same rows and columns as the visible table
- [ ] Changing a filter or the window changes the export to match
- [ ] Names containing a comma survive the round trip intact
- [ ] The file downloads with a recognisable name
- [ ] Serialisation is covered by domain tests
