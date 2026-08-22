# One Layout, shared by every Class

Seating chart tools normally give each class its own chart, so the obvious reading of
this schema — a single Layout with no Class relation on it — looks like something we
forgot. It's deliberate. A Layout describes furniture in a room, and the furniture does
not rearrange itself between third and fourth period; what changes is who sits where,
which is the Assignment. Splitting the two means a teacher draws their room once and
then only ever drags students, which is the operation they actually repeat.

## Consequences

Deleting a Seat unseats whoever occupies it in every Class at once, so the editor warns
with a count before it does. The Layout is sized for the largest Class, and smaller ones
simply leave Seats empty. A teacher who genuinely moves between two rooms is not
supported and would need Layouts to become per-Class, or per-room with a Class pointing
at one.
