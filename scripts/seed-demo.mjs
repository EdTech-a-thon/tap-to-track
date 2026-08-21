#!/usr/bin/env node
// Creates the demo teacher, so the deployed site can be shown without a login wall
// being the whole experience. Safe to re-run: it clears the demo account first.
//
//   node scripts/seed-demo.mjs [pocketbase-url]
//
// The names below are invented. Never seed this with a real roster.

const PB = process.argv[2] ?? process.env.PUBLIC_POCKETBASE_URL ?? "http://127.0.0.1:8090";
const EMAIL = "demo@tap-to-track.example";
const PASSWORD = "demoteacher";

const NAMES = ["Avery B", "Jordan K", "Kai M", "Morgan T", "Riley P", "Sam W",
  "Nico R", "Priya S", "Tomas L", "Wren H", "Ada F", "Bo N"];

const BEHAVIORS = [
  { name: "Participation", color: "#3d7ea6", mode: "tally", position: 0 },
  { name: "Positive behavior", color: "#2f7d5c", mode: "tally", position: 1 },
  { name: "Redirect", color: "#cf8a3f", mode: "tally", position: 2 },
  { name: "Absent", color: "#5a615e", mode: "toggle", position: 3, away: true },
];

const call = async (path, options = {}) => {
  const response = await fetch(PB + path, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${path} -> ${response.status} ${JSON.stringify(body)}`);
  return body;
};
const post = (path, body, token) => call(path, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
  body: JSON.stringify(body),
});

const pick = (list) => list[Math.floor(Math.random() * list.length)];

const account = await post("/api/collections/users/records", {
  email: EMAIL, password: PASSWORD, passwordConfirm: PASSWORD,
}).catch(() => null);

const { token, record } = await post("/api/collections/users/auth-with-password", {
  identity: EMAIL, password: PASSWORD,
});
const owner = record.id;
if (!account) console.log("Demo account already existed; adding to it.");

const behaviors = [];
for (const behavior of BEHAVIORS) {
  behaviors.push(await post("/api/collections/behaviors/records", { ...behavior, owner }, token));
}

// A room: five across, three deep, with an aisle down the middle.
const seats = [];
for (let row = 0; row < 3; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const x = column * 140 + (column >= 3 ? 60 : 0);
    seats.push(await post("/api/collections/seats/records", { x, y: row * 140, owner }, token));
  }
}

const behaviorIds = behaviors.map((behavior) => behavior.id);
const classes = [];
for (const name of ["Period 2", "Period 6"]) {
  classes.push(await post("/api/collections/classes/records", { name, behaviors: behaviorIds, owner }, token));
}

const students = [];
for (const [index, name] of NAMES.entries()) {
  const cls = classes[index % 2];
  const seat = seats[Math.floor(index / 2)];
  students.push(await post("/api/collections/students/records", {
    name, class: cls.id, seat: seat.id, owner,
  }, token));
}

// Six weeks of lessons, so the week / month / all-time windows each show something.
const tallying = behaviors.filter((behavior) => !behavior.away);
let sessionCount = 0;
let tapCount = 0;
for (let daysAgo = 40; daysAgo >= 0; daysAgo -= 2) {
  for (const cls of classes) {
    const opened = new Date(Date.now() - daysAgo * 86_400_000);
    const session = await post("/api/collections/sessions/records", {
      class: cls.id,
      openedAt: opened.toISOString(),
      endedAt: new Date(opened.getTime() + 50 * 60_000).toISOString(),
      owner,
    }, token);
    sessionCount += 1;

    const roster = students.filter((student) => student.class === cls.id);
    for (const student of roster) {
      for (let n = 0; n < Math.floor(Math.random() * 3); n += 1) {
        await post("/api/collections/taps/records", {
          session: session.id, student: student.id, behavior: pick(tallying).id, owner,
        }, token);
        tapCount += 1;
      }
    }
  }
}

console.log(`Demo ready: ${EMAIL} / ${PASSWORD}`);
console.log(`${classes.length} classes, ${students.length} students, ${seats.length} desks, ${sessionCount} sessions, ${tapCount} taps.`);
