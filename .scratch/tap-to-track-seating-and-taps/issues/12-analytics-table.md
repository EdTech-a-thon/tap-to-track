# 12 — Analytics table

**What to build:** A teacher sees patterns they cannot hold in their head. One table: a row
per Student with the Class they belong to, a column per selected Behavior, showing Tap
counts over the last week, the last month or all time. Filters choose the window, which
Behaviors to show, and which Classes to include. Columns sort on click. Students with no
Taps still appear, because the children being overlooked are the point.

**Blocked by:** 08 — The popup and Tap rows

**Status:** ready-for-agent

- [ ] The table shows one row per Student with a Class column
- [ ] Columns are the selected Behaviors and cells are Tap counts
- [ ] The window switches between rolling last-7-days, rolling last-30-days and all time
- [ ] Behaviors and Classes can each be filtered to a subset
- [ ] Clicking a column header sorts by it
- [ ] Students with zero Taps in the window still appear
- [ ] Aggregation over a window with filters is covered by domain tests
