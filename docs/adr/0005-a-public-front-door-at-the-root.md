# A public front door at the root, and the app moved to /chart

Until now the root URL was the seating chart, and anyone who was not signed in got the
sign-in form and nothing else. That is a reasonable shape for a tool with a captive
audience and a poor one for a product with its own address: a teacher who hears about
Tap and Tally and types tapandtally.com has never seen it, does not know whether it
stores their students' names, and is being asked for a password before they are given
a single reason to make one.

So the root is now a public page that says what the tool does, who it is for, and what
it keeps about children, and the app itself moved down one level:

- `/` — the homepage. Public, server-rendered, no PocketBase call on the way in.
- `/chart`, `/setup`, `/analytics` — the app, in a `(app)` route group whose layout
  carries the auth gate and the top bar.

The gate moved out of the root layout and into `(app)/+layout.svelte`, so the homepage
renders for a signed-out visitor without going near the sign-in form. Restoring a stored
sign-in stays in the root layout, because the homepage still wants to know: a signed-in
teacher is offered their chart rather than an invitation to sign up.

## Consequences

The homepage overrides the app's `ssr = false` with its own `ssr = true`, so it is
readable without JavaScript and by a crawler. Everything behind it stays client-only and
talks straight to PocketBase, as ADR 0001 describes.

A teacher who opens the site every morning now lands on marketing rather than their
room. The header and both hero buttons say "Open your chart" once they are known, and
the expectation is that daily users bookmark `/chart`. The offline refresh page at
`/reset-app.html` sends them back to `/chart` too, since the point of it is to reopen
the app.
