# A Student belongs to exactly one Class

A child taught in two of the same teacher's Classes is recorded here as two Students who
happen to share a name, and their Tap history does not add up across the two. The
many-to-many that would fix this leaks into every Assignment, filter, and export in the
app, permanently, to serve a case that is uncommon in the classrooms this is built for.
We took the simpler model with our eyes open.

## Consequences

Co-taught, looping, and split-schedule students have divided histories, and no view in
the app can total them. If that stops being an edge case, the fix is a join between
Student and Class rather than anything subtler.
