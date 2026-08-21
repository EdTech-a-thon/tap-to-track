# PocketBase, not localStorage, for Tap history

`AGENTS.md` tells this workspace to store no data, then `localStorage`, and to reach for
PocketBase only when accounts or shared persistence are strictly necessary — so a reader
finding a backend here would reasonably assume someone skipped a step. We didn't.
Tap-to-Track accumulates a term's worth of Taps whose whole value is being compared
across weeks, and `localStorage` puts that history in exactly one browser, where a
cleared cache destroys it silently and a teacher tapping on a tablet can't read the
analytics on their laptop. Durability and second-device access are the product, not a
nice-to-have, so PocketBase it is.

## Consequences

Tapping now depends on the network, which a classroom's wifi does not guarantee. The
tracking screen has to survive a dropped connection mid-lesson rather than assuming
every write lands.
