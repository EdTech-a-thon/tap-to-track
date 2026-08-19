# Tap-to-Track

Tap-to-Track is a deliberately simple, touch-first classroom tool. Teachers can
keep a class roster, mark attendance, and record positive participation or a
redirect with one tap.

## What it includes

- Multiple class rosters
- Present and absent status
- Large positive-participation and redirect buttons
- A simple summary of who has participated today
- Automatic saving on the current device

There are no accounts, grades, reports, or shared student data. Use first names,
initials, or classroom nicknames rather than sensitive student information.

## Development

Tap-to-Track uses SvelteKit and Bun.

```bash
bun install
../scripts/agent-dev.mjs /absolute/path/to/tap-to-track
```

Run checks with `bun run check` and create a production build with `bun run build`.

## License

Apache License 2.0. See `LICENSE.txt`.
