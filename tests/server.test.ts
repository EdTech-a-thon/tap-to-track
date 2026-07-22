import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../server/index.js";
import { createDatabase } from "../server/db.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parentSummary } from "../server/mastery.js";
import * as XLSX from "xlsx";

const apps: Awaited<ReturnType<typeof buildServer>>[] = [];
const photoDirs: string[] = [];

async function app() {
  const photoDir = await mkdtemp(join(tmpdir(), "tap-to-track-photos-"));
  photoDirs.push(photoDir);
  const instance = await buildServer({
    db: createDatabase(":memory:"),
    sessionSecret: "test-session-secret-at-least-24-characters",
    baseUrl: "http://test.local",
    photoDir,
  });
  apps.push(instance);
  return instance;
}

async function signup(server: Awaited<ReturnType<typeof app>>, email: string) {
  const response = await server.inject({
    method: "POST",
    url: "/api/auth/signup",
    payload: { email, password: "password123" },
  });
  return response.cookies.find((cookie) => cookie.name === "session")!.value;
}

async function createClass(
  server: Awaited<ReturnType<typeof app>>,
  session: string,
  name = "Class",
) {
  const response = await server.inject({
    method: "POST",
    url: "/api/classes",
    cookies: { session },
    payload: { name },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string; joinCode: string };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((server) => server.close()));
  await Promise.all(
    photoDirs
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Tap-to-Track server", () => {
  it("defaults, validates, and tenant-scopes participation guidance settings", async () => {
    const server = await app();
    const firstSession = await signup(server, "threshold-owner@example.com");
    const secondSession = await signup(server, "threshold-other@example.com");
    const room = await createClass(server, firstSession);
    const initial = await server.inject({ method: "GET", url: `/api/classes/${room.id}/snapshot`, cookies: { session: firstSession } });
    expect(initial.json().classRoom.settings).toMatchObject({ participationWatchAfter: 2, participationCheckInAfter: 3 });

    const invalid = await server.inject({ method: "PUT", url: `/api/classes/${room.id}/settings`, cookies: { session: firstSession }, payload: { participationWatchAfter: 4, participationCheckInAfter: 3 } });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error).toBe("Check in must be greater than or equal to Watch");
    const outOfRange = await server.inject({ method: "PUT", url: `/api/classes/${room.id}/settings`, cookies: { session: firstSession }, payload: { participationWatchAfter: 0 } });
    expect(outOfRange.statusCode).toBe(400);

    const saved = await server.inject({ method: "PUT", url: `/api/classes/${room.id}/settings`, cookies: { session: firstSession }, payload: { participationWatchAfter: null, participationCheckInAfter: 5 } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ participationWatchAfter: null, participationCheckInAfter: 5 });
    expect((await server.inject({ method: "PUT", url: `/api/classes/${room.id}/settings`, cookies: { session: secondSession }, payload: { participationWatchAfter: 1 } })).statusCode).toBe(404);
  });
  it("counts parent evidence and support independently", () => {
    const skills = [
      { id: "parent" },
      { id: "a", parentSkillId: "parent" },
      { id: "b", parentSkillId: "parent" },
      { id: "c", parentSkillId: "parent" },
    ];
    const mastery = [
      {
        studentId: "student",
        skillId: "a",
        achievement: "meets",
        requiresSupport: true,
      },
      {
        studentId: "student",
        skillId: "b",
        achievement: "exceeds",
        requiresSupport: false,
      },
    ];
    expect(parentSummary(skills, mastery, "student", "parent")).toEqual({
      total: 3,
      evidenceCount: 2,
      meetOrExceedCount: 2,
      requiresSupportCount: 1,
      notStartedCount: 1,
    });
  });
  it("strictly isolates teacher tenants", async () => {
    const server = await app();
    const first = await signup(server, "first@example.com");
    const second = await signup(server, "second@example.com");
    const room = await createClass(server, first, "Private class");

    expect(
      (
        await server.inject({
          method: "GET",
          url: `/api/classes/${room.id}/snapshot`,
          cookies: { session: second },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await server.inject({
          method: "PATCH",
          url: `/api/classes/${room.id}`,
          cookies: { session: second },
          payload: { name: "Stolen" },
        })
      ).statusCode,
    ).toBe(404);
    const classes = await server.inject({
      method: "GET",
      url: "/api/classes",
      cookies: { session: second },
    });
    expect(classes.json()).toEqual({ classes: [] });
  });

  it("keeps durable requests ordered, independent, private, and tenant-isolated", async () => {
    const server = await app();
    const owner = await signup(server, "requests@example.com");
    const other = await signup(server, "requests-other@example.com");
    const room = await createClass(server, owner);
    const studentIds = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/roster`,
        cookies: { session: owner },
        payload: { students: [{ displayName: "A" }, { displayName: "B" }] },
      })
    ).json().created as string[];
    const snapshot = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${room.id}/snapshot`,
        cookies: { session: owner },
      })
    ).json();
    const attention = snapshot.requestTypes.find(
      (type: { behavior: string }) => type.behavior === "attention",
    );
    const bathroom = snapshot.requestTypes.find(
      (type: { behavior: string }) => type.behavior === "presence",
    );
    expect(
      snapshot.requestTypes.find(
        (type: { label: string }) => type.label === "Done",
      ),
    ).toMatchObject({ behavior: "completion", resolveLabel: "Reviewed" });
    const accesses = await Promise.all(
      studentIds.map(
        async (studentId) =>
          (
            await server.inject({
              method: "POST",
              url: `/api/student/join/${room.joinCode}/select`,
              payload: { studentId },
            })
          ).cookies.find((cookie) => cookie.name === "student_access")!.value,
      ),
    );
    const first = await server.inject({
      method: "POST",
      url: `/api/student/requests/${attention.id}`,
      cookies: { student_access: accesses[0] },
    });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await server.inject({
      method: "POST",
      url: `/api/student/requests/${attention.id}`,
      cookies: { student_access: accesses[1] },
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(
      (
        await server.inject({
          method: "POST",
          url: `/api/student/requests/${bathroom.id}`,
          cookies: { student_access: accesses[0] },
        })
      ).statusCode,
    ).toBe(409);
    const own = (
      await server.inject({
        method: "GET",
        url: "/api/student/me",
        cookies: { student_access: accesses[1] },
      })
    ).json();
    expect(own.requestPositions[0].position).toBe(2);
    expect(JSON.stringify(own.requests)).not.toContain(studentIds[0]);
    expect(own.requestPositions[0].requestId).toBe(second.json().id);

    expect(
      (
        await server.inject({
          method: "POST",
          url: `/api/classes/${room.id}/requests/next`,
          cookies: { session: other },
        })
      ).statusCode,
    ).toBe(404);
    const next = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/requests/next`,
      cookies: { session: owner },
    });
    expect(next.json()).toMatchObject({
      id: first.json().id,
      status: "acknowledged",
    });
    const resolved = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/requests/${first.json().id}/resolve`,
      cookies: { session: owner },
    });
    expect(resolved.statusCode).toBe(200);
    let after = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${room.id}/snapshot`,
        cookies: { session: owner },
      })
    ).json();
    expect(after.requests.map((request: { id: string }) => request.id)).toEqual(
      [second.json().id],
    );
    expect(
      (
        await server.inject({
          method: "POST",
          url: `/api/classes/${room.id}/requests/${first.json().id}/restore`,
          cookies: { session: owner },
        })
      ).statusCode,
    ).toBe(200);
    after = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${room.id}/snapshot`,
        cookies: { session: owner },
      })
    ).json();
    expect(after.requests).toHaveLength(2);
    expect(after.requestHistory).toHaveLength(2);
    const resolvedOwn = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/requests/${first.json().id}/resolve`,
      cookies: { session: owner },
    });
    expect(resolvedOwn.statusCode).toBe(200);
    const ownAfter = (
      await server.inject({
        method: "GET",
        url: "/api/student/me",
        cookies: { student_access: accesses[0] },
      })
    ).json();
    expect(ownAfter.requests).toEqual([
      expect.objectContaining({ id: first.json().id, status: "resolved" }),
    ]);
  });

  it("counts participation tallies and absences", async () => {
    const server = await app();
    const session = await signup(server, "counts@example.com");
    const room = await createClass(server, session);
    const roster = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/roster`,
      cookies: { session },
      payload: { students: [{ displayName: "Learner" }] },
    });
    const studentId = roster.json().created[0] as string;
    const period = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/periods`,
      cookies: { session },
      payload: { label: "Today" },
    });
    const periodId = period.json().id as string;
    for (const type of ["part+", "part+", "part-"])
      await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/events`,
        cookies: { session },
        payload: { studentId, periodId, type },
      });
    await server.inject({
      method: "PUT",
      url: `/api/classes/${room.id}/attendance/${studentId}`,
      cookies: { session },
      payload: { periodId, status: "absent" },
    });

    const snapshot = await server.inject({
      method: "GET",
      url: `/api/classes/${room.id}/snapshot`,
      cookies: { session },
    });
    expect(snapshot.json().summaries).toEqual([
      {
        studentId,
        participation: 1,
        absences: 1,
        parentSummaries: {},
        skillsTotal: 0,
      },
    ]);
  });

  it("undoes the latest participation event for one learner", async () => {
    const server = await app();
    const session = await signup(server, "undo@example.com");
    const room = await createClass(server, session);
    const roster = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/roster`,
      cookies: { session },
      payload: {
        importId: "undo-roster",
        students: [{ displayName: "Avery" }],
      },
    });
    const studentId = roster.json().created[0] as string;
    const snapshot = await server.inject({
      method: "GET",
      url: `/api/classes/${room.id}/snapshot`,
      cookies: { session },
    });
    const periodId = snapshot
      .json()
      .periods.find((period: { active: boolean }) => period.active)
      .id as string;
    await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/events`,
      cookies: { session },
      payload: { studentId, periodId, type: "part+" },
    });
    await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/events`,
      cookies: { session },
      payload: { studentId, periodId, type: "part-" },
    });
    expect(
      (
        await server.inject({
          method: "DELETE",
          url: `/api/classes/${room.id}/events/last/${studentId}`,
          cookies: { session },
        })
      ).statusCode,
    ).toBe(204);
    const after = await server.inject({
      method: "GET",
      url: `/api/classes/${room.id}/snapshot`,
      cookies: { session },
    });
    expect(
      after.json().events.map((event: { type: string }) => event.type),
    ).toEqual(["part+"]);
  });

  it("does not duplicate a replayed roster import", async () => {
    const server = await app();
    const session = await signup(server, "roster@example.com");
    const room = await createClass(server, session);
    const payload = {
      importId: "same-import",
      students: [{ displayName: "Avery" }, { displayName: "Jordan" }],
    };
    await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/roster`,
      cookies: { session },
      payload,
    });
    await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/roster`,
      cookies: { session },
      payload,
    });
    const snapshot = await server.inject({
      method: "GET",
      url: `/api/classes/${room.id}/snapshot`,
      cookies: { session },
    });
    expect(
      snapshot
        .json()
        .students.map(
          (student: { displayName: string }) => student.displayName,
        ),
    ).toEqual(["Avery", "Jordan"]);
  });

  it("tracks attendance for learners added during an active period", async () => {
    const server = await app();
    const session = await signup(server, "grid-attendance@example.com");
    const room = await createClass(server, session);
    const roster = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/roster`,
      cookies: { session },
      payload: {
        importId: "attendance-import",
        students: [{ displayName: "Avery" }],
      },
    });
    const studentId = roster.json().created[0] as string;
    const snapshotBefore = await server.inject({
      method: "GET",
      url: `/api/classes/${room.id}/snapshot`,
      cookies: { session },
    });
    const periodId = snapshotBefore
      .json()
      .periods.find((period: { active: boolean }) => period.active)
      .id as string;
    expect(snapshotBefore.json().attendance).toContainEqual({
      periodId,
      studentId,
      status: "present",
    });
    const marked = await server.inject({
      method: "PUT",
      url: `/api/classes/${room.id}/attendance/${studentId}`,
      cookies: { session },
      payload: { periodId, status: "absent" },
    });
    expect(marked.statusCode).toBe(200);
    const snapshotAfter = await server.inject({
      method: "GET",
      url: `/api/classes/${room.id}/snapshot`,
      cookies: { session },
    });
    expect(snapshotAfter.json().attendance).toContainEqual({
      periodId,
      studentId,
      status: "absent",
    });
  });

  it("edits and archives roster details within the owning class", async () => {
    const server = await app();
    const owner = await signup(server, "roster-owner@example.com");
    const other = await signup(server, "roster-other@example.com");
    const room = await createClass(server, owner);
    const roster = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/roster`,
      cookies: { session: owner },
      payload: { students: [{ displayName: "Avery" }] },
    });
    const studentId = roster.json().created[0] as string;
    const enrolledAt = "2026-01-12T00:00:00.000Z";
    const payload = {
      displayName: "Avery R.",
      avatar: { emoji: "🦊", color: "#3178a8", shape: "rounded" },
      tags: ["Table 2"],
      enrolledAt,
      archived: true,
    };
    expect(
      (
        await server.inject({
          method: "PATCH",
          url: `/api/classes/${room.id}/students/${studentId}`,
          cookies: { session: other },
          payload,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await server.inject({
          method: "PATCH",
          url: `/api/classes/${room.id}/students/${studentId}`,
          cookies: { session: owner },
          payload,
        })
      ).statusCode,
    ).toBe(200);
    const snapshot = await server.inject({
      method: "GET",
      url: `/api/classes/${room.id}/snapshot`,
      cookies: { session: owner },
    });
    expect(snapshot.json().students[0]).toMatchObject({
      displayName: "Avery R.",
      avatar: payload.avatar,
      tags: ["Table 2"],
      enrolledAt,
      archived: true,
    });
    expect(snapshot.json().students[0].archivedAt).toBeTruthy();
    expect(
      (
        await server.inject({
          method: "PATCH",
          url: `/api/classes/${room.id}/students/${studentId}`,
          cookies: { session: owner },
          payload: {
            avatar: { emoji: "unsafe", color: "#000000", shape: "triangle" },
          },
        })
      ).statusCode,
    ).toBe(400);
  });

  it("bulk resets seating only for the owning class", async () => {
    const server = await app();
    const owner = await signup(server, "seat-owner@example.com");
    const other = await signup(server, "seat-other@example.com");
    const room = await createClass(server, owner);
    const studentId = (await server.inject({ method: "POST", url: `/api/classes/${room.id}/roster`, cookies: { session: owner }, payload: { students: [{ displayName: "Avery" }] } })).json().created[0];
    await server.inject({ method: "PATCH", url: `/api/classes/${room.id}/students/${studentId}`, cookies: { session: owner }, payload: { x: 20, y: 30 } });
    expect((await server.inject({ method: "POST", url: `/api/classes/${room.id}/seating/reset`, cookies: { session: other } })).statusCode).toBe(404);
    const reset = await server.inject({ method: "POST", url: `/api/classes/${room.id}/seating/reset`, cookies: { session: owner } });
    expect(reset.json()).toEqual({ reset: 1 });
    const snapshot = (await server.inject({ method: "GET", url: `/api/classes/${room.id}/snapshot`, cookies: { session: owner } })).json();
    expect(snapshot.students[0]).toMatchObject({ x: null, y: null });
  });

  it("creates multiple independent skills in one class", async () => {
    const server = await app();
    const session = await signup(server, "multiple-skills@example.com");
    const room = await createClass(server, session);
    for (const label of ["Plan", "Build", "Reflect"]) {
      const response = await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/skills`,
        cookies: { session },
        payload: { label, category: "General", visibleToStudents: true },
      });
      expect(response.statusCode).toBe(201);
    }
    const snapshot = await server.inject({
      method: "GET",
      url: `/api/classes/${room.id}/snapshot`,
      cookies: { session },
    });
    expect(
      snapshot.json().skills.map((skill: { label: string }) => skill.label),
    ).toEqual(["Plan", "Build", "Reflect"]);
  });

  it("summarizes parent achievement from all subskills", async () => {
    const server = await app();
    const session = await signup(server, "subskills@example.com");
    const room = await createClass(server, session);
    const roster = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/roster`,
      cookies: { session },
      payload: {
        importId: "subskill-roster",
        students: [{ displayName: "Avery" }],
      },
    });
    const studentId = roster.json().created[0] as string;
    const parent = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/skills`,
      cookies: { session },
      payload: {
        label: "Operate machine",
        category: "Machine skills",
        visibleToStudents: true,
      },
    });
    const first = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/skills`,
      cookies: { session },
      payload: {
        label: "Thread machine",
        category: "Machine skills",
        parentSkillId: parent.json().id,
        visibleToStudents: true,
      },
    });
    const second = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/skills`,
      cookies: { session },
      payload: {
        label: "Wind bobbin",
        category: "Machine skills",
        parentSkillId: parent.json().id,
        visibleToStudents: true,
      },
    });
    expect(
      (
        await server.inject({
          method: "PUT",
          url: `/api/classes/${room.id}/mastery/${studentId}/${parent.json().id}`,
          cookies: { session },
          payload: { achievement: "meets" },
        })
      ).statusCode,
    ).toBe(409);
    await server.inject({
      method: "PUT",
      url: `/api/classes/${room.id}/mastery/${studentId}/${first.json().id}`,
      cookies: { session },
      payload: { achievement: "meets" },
    });
    await server.inject({
      method: "PUT",
      url: `/api/classes/${room.id}/mastery/${studentId}/${second.json().id}`,
      cookies: { session },
      payload: { achievement: "approaching" },
    });
    await server.inject({
      method: "PUT",
      url: `/api/classes/${room.id}/mastery/${studentId}/${second.json().id}`,
      cookies: { session },
      payload: { achievement: "exceeds" },
    });
    const snapshot = (await server.inject({ method: "GET", url: `/api/classes/${room.id}/snapshot`, cookies: { session } })).json();
    expect(snapshot.mastery.find((item: { skillId: string }) => item.skillId === first.json().id).achievement).toBe("meets");
    expect(snapshot.mastery.find((item: { skillId: string }) => item.skillId === second.json().id).achievement).toBe("exceeds");
    expect(snapshot.summaries.find((item: { studentId: string }) => item.studentId === studentId).parentSummaries[parent.json().id].meetOrExceedCount).toBe(2);
  });

  it("records immutable period evidence and reconstructs historical mastery", async () => {
    const server = await app();
    const session = await signup(server, "evidence@example.com");
    const room = await createClass(server, session);
    const studentId = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/roster`,
        cookies: { session },
        payload: { students: [{ displayName: "Avery" }] },
      })
    ).json().created[0];
    const parent = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/skills`,
        cookies: { session },
        payload: { label: "Write", category: "ELA" },
      })
    ).json();
    const skill = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/skills`,
        cookies: { session },
        payload: { label: "Draft", category: "ELA", parentSkillId: parent.id },
      })
    ).json();
    const period = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/periods`,
        cookies: { session },
        payload: { label: "Evidence day" },
      })
    ).json();
    const first = new Date(Date.parse(period.startedAt) + 1000).toISOString();
    const reportEnd = new Date(
      Date.parse(period.startedAt) + 2000,
    ).toISOString();
    const second = new Date(Date.parse(period.startedAt) + 3000).toISOString();
    await server.inject({
      method: "PUT",
      url: `/api/classes/${room.id}/mastery/${studentId}/${skill.id}`,
      cookies: { session },
      payload: {
        achievement: "approaching",
        assessedAt: first,
        periodId: period.id,
      },
    });
    await server.inject({
      method: "PUT",
      url: `/api/classes/${room.id}/mastery/${studentId}/${skill.id}`,
      cookies: { session },
      payload: {
        achievement: "meets",
        requiresSupport: true,
        assessedAt: second,
        periodId: period.id,
      },
    });
    const historical = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${room.id}/reports?range=custom&from=${encodeURIComponent(period.startedAt)}&to=${encodeURIComponent(reportEnd)}`,
        cookies: { session },
      })
    ).json();
    expect(
      historical.skills.find((item: { id: string }) => item.id === skill.id)
        .achievements[0].achievement,
    ).toBe("approaching");
    expect(historical.masteryEvents).toContainEqual(
      expect.objectContaining({
        skillLabel: "Draft",
        achievement: "approaching",
        periodId: period.id,
        timestamp: first,
      }),
    );
    expect(
      historical.skills.find((item: { id: string }) => item.id === parent.id)
        .summaries[0].summary.meetOrExceedCount,
    ).toBe(0);
  });

  it("merges and explicitly replaces cloned skill definitions", async () => {
    const server = await app();
    const session = await signup(server, "clone@example.com");
    const source = await createClass(server, session, "Source");
    const target = await createClass(server, session, "Target");
    await server.inject({
      method: "POST",
      url: `/api/classes/${source.id}/skills`,
      cookies: { session },
      payload: { label: "Explain", category: "Science" },
    });
    const first = await server.inject({
      method: "POST",
      url: `/api/classes/${target.id}/skills/clone`,
      cookies: { session },
      payload: { sourceClassId: source.id, mode: "merge" },
    });
    const duplicate = await server.inject({
      method: "POST",
      url: `/api/classes/${target.id}/skills/clone`,
      cookies: { session },
      payload: { sourceClassId: source.id, mode: "merge" },
    });
    expect(first.json()).toMatchObject({ created: 1, skipped: 0 });
    expect(duplicate.json()).toMatchObject({ created: 0, skipped: 1 });
    await server.inject({
      method: "POST",
      url: `/api/classes/${target.id}/skills`,
      cookies: { session },
      payload: { label: "Remove me" },
    });
    expect(
      (
        await server.inject({
          method: "POST",
          url: `/api/classes/${target.id}/skills/clone`,
          cookies: { session },
          payload: { sourceClassId: source.id, mode: "replace" },
        })
      ).json(),
    ).toMatchObject({ mode: "replace", created: 1, removed: 2 });
  });

  it("retains deleted-skill evidence, cleans learner evidence, and roundtrips backups", async () => {
    const server = await app();
    const session = await signup(server, "backup@example.com");
    const room = await createClass(server, session);
    const studentId = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/roster`,
        cookies: { session },
        payload: { students: [{ displayName: "Avery" }] },
      })
    ).json().created[0];
    const skillId = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/skills`,
        cookies: { session },
        payload: { label: "Original label" },
      })
    ).json().id;
    await server.inject({
      method: "PUT",
      url: `/api/classes/${room.id}/mastery/${studentId}/${skillId}`,
      cookies: { session },
      payload: { achievement: "meets" },
    });
    await server.inject({
      method: "DELETE",
      url: `/api/classes/${room.id}/skills/${skillId}`,
      cookies: { session },
    });
    const exported = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${room.id}/export/json`,
        cookies: { session },
      })
    ).json();
    expect(exported.masteryEvents[0].skillLabel).toBe("Original label");
    const restored = await server.inject({
      method: "POST",
      url: "/api/import/json",
      cookies: { session },
      payload: exported,
    });
    const restoredSnapshot = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${restored.json().classId}/snapshot`,
        cookies: { session },
      })
    ).json();
    expect(restoredSnapshot.students[0].displayName).toBe("Avery");
    expect(restoredSnapshot.masteryEvents[0].skillLabel).toBe("Original label");
    expect(
      restoredSnapshot.periods.some((item: { active: boolean }) => item.active),
    ).toBe(true);
    await server.inject({
      method: "DELETE",
      url: `/api/classes/${restored.json().classId}/students/${restoredSnapshot.students[0].id}`,
      cookies: { session },
    });
    expect(
      (
        await server.inject({
          method: "GET",
          url: `/api/classes/${restored.json().classId}/snapshot`,
          cookies: { session },
        })
      ).json().masteryEvents,
    ).toEqual([]);
  });

  it("uses instructional expected periods and enrollment in report denominators", async () => {
    const server = await app();
    const session = await signup(server, "reports@example.com");
    const room = await createClass(server, session);
    const firstPeriod = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${room.id}/snapshot`,
        cookies: { session },
      })
    ).json().periods[0];
    await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/periods/${firstPeriod.id}/finish`,
      cookies: { session },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const roster = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/roster`,
      cookies: { session },
      payload: { students: [{ displayName: "Later learner" }] },
    });
    const studentId = roster.json().created[0] as string;
    const independent = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/periods`,
      cookies: { session },
      payload: {
        label: "Practice",
        type: "independent",
        participationExpected: false,
      },
    });
    await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/periods`,
      cookies: { session },
      payload: {
        label: "Lesson",
        type: "instructional",
        participationExpected: true,
      },
    });
    const report = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${room.id}/reports?range=all`,
        cookies: { session },
      })
    ).json();
    const learner = report.students.find(
      (item: { studentId: string }) => item.studentId === studentId,
    );
    expect(learner.enrolledPeriods).toBe(2);
    expect(learner.attendedInstructionalExpectedPeriods).toBe(1);
    expect(learner.participationEligiblePeriods).toBe(1);
    expect(
      report.periods.find(
        (period: { id: string }) => period.id === independent.json().id,
      ).participationExpected,
    ).toBe(false);
  });

  it("records append-only mastery history and isolates reports", async () => {
    const server = await app();
    const owner = await signup(server, "history@example.com");
    const other = await signup(server, "other-reports@example.com");
    const room = await createClass(server, owner);
    const studentId = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/roster`,
        cookies: { session: owner },
        payload: { students: [{ displayName: "Avery" }] },
      })
    ).json().created[0];
    const skillId = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/skills`,
        cookies: { session: owner },
        payload: { label: "Explain" },
      })
    ).json().id;
    await server.inject({
      method: "PUT",
      url: `/api/classes/${room.id}/mastery/${studentId}/${skillId}`,
      cookies: { session: owner },
      payload: { achievement: "approaching", requiresSupport: true },
    });
    await server.inject({
      method: "PUT",
      url: `/api/classes/${room.id}/mastery/${studentId}/${skillId}`,
      cookies: { session: owner },
      payload: { achievement: "meets", requiresSupport: true },
    });
    const snapshot = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${room.id}/snapshot`,
        cookies: { session: owner },
      })
    ).json();
    expect(
      snapshot.masteryEvents.map(
        (event: {
          previousAchievement: string;
          achievement: string;
          requiresSupport: boolean;
        }) => [
          event.previousAchievement,
          event.achievement,
          event.requiresSupport,
        ],
      ),
    ).toEqual([
      ["not_started", "approaching", true],
      ["approaching", "meets", true],
    ]);
    expect(
      (
        await server.inject({
          method: "GET",
          url: `/api/classes/${room.id}/reports`,
          cookies: { session: other },
        })
      ).statusCode,
    ).toBe(404);
  });

  it("deletes only empty periods and merges populated periods safely", async () => {
    const server = await app();
    const session = await signup(server, "period-management@example.com");
    const room = await createClass(server, session);
    const studentId = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/roster`,
        cookies: { session },
        payload: { students: [{ displayName: "Avery" }] },
      })
    ).json().created[0];
    const empty = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/periods`,
      cookies: { session },
      payload: { label: "Empty" },
    });
    await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/periods/${empty.json().id}/finish`,
      cookies: { session },
      payload: { confirmAttendanceIncomplete: true },
    });
    expect(
      (
        await server.inject({
          method: "DELETE",
          url: `/api/classes/${room.id}/periods/${empty.json().id}`,
          cookies: { session },
        })
      ).statusCode,
    ).toBe(204);
    const target = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/periods`,
      cookies: { session },
      payload: { label: "Target" },
    });
    const source = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/periods`,
      cookies: { session },
      payload: { label: "Duplicate" },
    });
    await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/events`,
      cookies: { session },
      payload: { studentId, periodId: source.json().id, type: "part+" },
    });
    await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/periods/${source.json().id}/finish`,
      cookies: { session },
      payload: { confirmAttendanceIncomplete: true },
    });
    expect(
      (
        await server.inject({
          method: "DELETE",
          url: `/api/classes/${room.id}/periods/${source.json().id}`,
          cookies: { session },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await server.inject({
          method: "POST",
          url: `/api/classes/${room.id}/periods/${source.json().id}/merge`,
          cookies: { session },
          payload: { targetPeriodId: target.json().id },
        })
      ).statusCode,
    ).toBe(200);
    const snapshot = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${room.id}/snapshot`,
        cookies: { session },
      })
    ).json();
    expect(
      snapshot.periods.some(
        (period: { id: string }) => period.id === source.json().id,
      ),
    ).toBe(false);
    expect(snapshot.events).toContainEqual(
      expect.objectContaining({ periodId: target.json().id, type: "part+" }),
    );
  });

  it("edits and deletes exact historical participation actions with strict tenancy", async () => {
    const server = await app();
    const owner = await signup(server, "history-owner@example.com");
    const other = await signup(server, "history-other@example.com");
    const room = await createClass(server, owner);
    const studentId = (await server.inject({ method: "POST", url: `/api/classes/${room.id}/roster`, cookies: { session: owner }, payload: { students: [{ displayName: "Avery" }] } })).json().created[0];
    const snapshot = (await server.inject({ method: "GET", url: `/api/classes/${room.id}/snapshot`, cookies: { session: owner } })).json();
    const periodId = snapshot.periods.find((period: { status: string }) => period.status === "live").id;
    const first = await server.inject({ method: "POST", url: `/api/classes/${room.id}/events`, cookies: { session: owner }, payload: { studentId, periodId, type: "part+" } });
    const second = await server.inject({ method: "POST", url: `/api/classes/${room.id}/events`, cookies: { session: owner }, payload: { studentId, periodId, type: "part+" } });
    await server.inject({ method: "POST", url: `/api/classes/${room.id}/periods/${periodId}/finish`, cookies: { session: owner }, payload: { confirmAttendanceIncomplete: true } });
    const listed = await server.inject({ method: "GET", url: `/api/classes/${room.id}/participation-actions?periodId=${periodId}&studentId=${studentId}&from=2000-01-01&to=2100-01-01`, cookies: { session: owner } });
    expect(listed.json().actions.map((action: { id: string }) => action.id)).toEqual([second.json().id, first.json().id]);
    expect((await server.inject({ method: "PATCH", url: `/api/classes/${room.id}/events/${first.json().id}`, cookies: { session: other }, payload: { type: "part-" } })).statusCode).toBe(404);
    expect((await server.inject({ method: "PATCH", url: `/api/classes/${room.id}/events/${first.json().id}`, cookies: { session: owner }, payload: { type: "part-" } })).statusCode).toBe(200);
    expect((await server.inject({ method: "DELETE", url: `/api/classes/${room.id}/events/${second.json().id}`, cookies: { session: owner } })).statusCode).toBe(204);
    expect((await server.inject({ method: "GET", url: `/api/classes/${room.id}/participation-actions`, cookies: { session: owner } })).json().actions).toEqual([expect.objectContaining({ id: first.json().id, type: "part-", periodStatus: "closed" })]);
  });

  it("persists timer state, serves it to the owning student, and stops it on finish", async () => {
    const server = await app();
    const owner = await signup(server, "timer-owner@example.com");
    const other = await signup(server, "timer-other@example.com");
    const room = await createClass(server, owner);
    const studentId = (await server.inject({ method: "POST", url: `/api/classes/${room.id}/roster`, cookies: { session: owner }, payload: { students: [{ displayName: "Timer learner" }] } })).json().created[0];
    const access = (await server.inject({ method: "POST", url: `/api/student/join/${room.joinCode}/select`, payload: { studentId } })).cookies.find((cookie) => cookie.name === "student_access")!.value;
    const started = await server.inject({ method: "POST", url: `/api/classes/${room.id}/timer/start`, cookies: { session: owner }, payload: { durationSeconds: 300, label: "Wrap-up" } });
    expect(started.json().timer).toMatchObject({ status: "running", durationSeconds: 300, remainingSeconds: 300, revision: 1 });
    expect((await server.inject({ method: "GET", url: `/api/classes/${room.id}/timer`, cookies: { session: other } })).statusCode).toBe(404);
    expect((await server.inject({ method: "GET", url: "/api/student/me", cookies: { student_access: access } })).json().timer).toMatchObject({ status: "running", label: "Wrap-up" });
    expect((await server.inject({ method: "POST", url: `/api/classes/${room.id}/timer/pause`, cookies: { session: owner }, payload: {} })).json().timer.status).toBe("paused");
    expect((await server.inject({ method: "POST", url: `/api/classes/${room.id}/timer/resume`, cookies: { session: owner }, payload: {} })).json().timer.status).toBe("running");
    const periodId = (await server.inject({ method: "GET", url: `/api/classes/${room.id}/snapshot`, cookies: { session: owner } })).json().periods.find((period: { status: string }) => period.status === "live").id;
    await server.inject({ method: "POST", url: `/api/classes/${room.id}/periods/${periodId}/finish`, cookies: { session: owner }, payload: { confirmAttendanceIncomplete: true } });
    expect((await server.inject({ method: "GET", url: `/api/classes/${room.id}/timer`, cookies: { session: owner } })).json().timer.status).toBe("stopped");
  });

  it("paginates 500 normalized class memberships and isolates dashboard tenants", async () => {
    const server = await app();
    const owner = await signup(server, "dashboard-owner@example.com");
    const other = await signup(server, "dashboard-other@example.com");
    const room = await createClass(server, owner, "Large class");
    const students = Array.from({ length: 500 }, (_, index) => ({ displayName: `Learner ${String(index).padStart(3, "0")}` }));
    await server.inject({ method: "POST", url: `/api/classes/${room.id}/roster`, cookies: { session: owner }, payload: { students } });
    const startedAt = performance.now();
    const first = await server.inject({ method: "GET", url: "/api/all-students/progress?page=1&pageSize=100", cookies: { session: owner } });
    expect(performance.now() - startedAt).toBeLessThan(2000);
    expect(first.json()).toMatchObject({ total: 500, page: 1, pageSize: 100 });
    expect(first.json().rows).toHaveLength(100);
    expect(first.json().rows[0]).toEqual(expect.objectContaining({ classId: room.id, className: "Large class", eligibleDays: 0, positiveActionDays: 0, absenceCount: 0, enrolledClassDays: 0, evidenceCount: 0, totalSkills: 0, meetOrExceedCount: 0, supportCount: 0, lastActionAt: null }));
    expect((await server.inject({ method: "GET", url: "/api/all-students/progress?page=5&pageSize=100", cookies: { session: owner } })).json().rows).toHaveLength(100);
    expect((await server.inject({ method: "GET", url: "/api/all-students/progress", cookies: { session: other } })).json()).toMatchObject({ rows: [], total: 0 });
  });

  it("isolates calendar entries by teacher", async () => {
    const server = await app();
    const owner = await signup(server, "calendar-owner@example.com");
    const other = await signup(server, "calendar-other@example.com");
    const room = await createClass(server, owner, "Owner calendar");
    const date = "2099-04-06";
    await server.inject({
      method: "POST",
      url: "/api/calendar/days",
      cookies: { session: owner },
      payload: {
        date,
        scope: "all",
        type: "instructional",
        participationExpected: true,
      },
    });
    const calendar = await server.inject({
      method: "GET",
      url: `/api/calendar?from=${date}&to=${date}`,
      cookies: { session: other },
    });
    expect(calendar.statusCode).toBe(200);
    expect(calendar.json()).toEqual({ classes: [], periods: [] });
    expect(JSON.stringify(calendar.json())).not.toContain(room.id);
  });

  it("schedules all or selected classes and skips duplicate class days", async () => {
    const server = await app();
    const session = await signup(server, "calendar-scope@example.com");
    const first = await createClass(server, session, "First");
    const second = await createClass(server, session, "Second");
    const selectedDate = "2099-05-08";
    const selected = await server.inject({
      method: "POST",
      url: "/api/calendar/days",
      cookies: { session },
      payload: {
        date: selectedDate,
        scope: "selected",
        classIds: [first.id],
        type: "assessment",
        participationExpected: false,
      },
    });
    expect(selected.statusCode).toBe(201);
    expect(
      selected.json().created.map((item: { classId: string }) => item.classId),
    ).toEqual([first.id]);
    const all = await server.inject({
      method: "POST",
      url: "/api/calendar/days",
      cookies: { session },
      payload: {
        date: selectedDate,
        scope: "all",
        type: "instructional",
        participationExpected: true,
      },
    });
    expect(
      all.json().created.map((item: { classId: string }) => item.classId),
    ).toEqual([second.id]);
    expect(all.json().skipped).toEqual([first.id]);
    const calendar = (
      await server.inject({
        method: "GET",
        url: `/api/calendar?from=${selectedDate}&to=${selectedDate}`,
        cookies: { session },
      })
    ).json();
    expect(calendar.periods).toHaveLength(2);
    expect(
      calendar.periods.every(
        (period: { scheduled: boolean; active: boolean }) =>
          period.scheduled && !period.active,
      ),
    ).toBe(true);
  });

  it("rejects calendar classes owned by another teacher", async () => {
    const server = await app();
    const owner = await signup(server, "calendar-validation@example.com");
    const other = await signup(server, "calendar-intruder@example.com");
    const foreign = await createClass(server, other, "Foreign");
    const response = await server.inject({
      method: "POST",
      url: "/api/calendar/days",
      cookies: { session: owner },
      payload: {
        date: "2099-06-07",
        scope: "selected",
        classIds: [foreign.id],
        type: "instructional",
        participationExpected: true,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it("keeps scheduled days out of attendance and reports until started", async () => {
    const server = await app();
    const session = await signup(server, "calendar-start@example.com");
    const room = await createClass(server, session);
    const studentId = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/roster`,
        cookies: { session },
        payload: { students: [{ displayName: "Avery" }] },
      })
    ).json().created[0];
    const date = "2099-07-09";
    const scheduled = await server.inject({
      method: "POST",
      url: "/api/calendar/days",
      cookies: { session },
      payload: {
        date,
        scope: "selected",
        classIds: [room.id],
        type: "instructional",
        participationExpected: true,
      },
    });
    const periodId = scheduled.json().created[0].id as string;
    const before = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${room.id}/snapshot`,
        cookies: { session },
      })
    ).json();
    expect(
      before.periods.find((period: { id: string }) => period.id === periodId),
    ).toMatchObject({ scheduled: true, active: false });
    expect(
      before.attendance.some(
        (entry: { periodId: string }) => entry.periodId === periodId,
      ),
    ).toBe(false);
    const reportBefore = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${room.id}/reports?range=all`,
        cookies: { session },
      })
    ).json();
    expect(
      reportBefore.periods.some(
        (period: { id: string }) => period.id === periodId,
      ),
    ).toBe(false);
    expect(
      (
        await server.inject({
          method: "POST",
          url: `/api/classes/${room.id}/events`,
          cookies: { session },
          payload: { studentId, periodId, type: "part+" },
        })
      ).statusCode,
    ).toBe(409);

    const started = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/periods/${periodId}/start`,
      cookies: { session },
    });
    expect(started.statusCode).toBe(200);
    const after = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${room.id}/snapshot`,
        cookies: { session },
      })
    ).json();
    expect(
      after.periods.find((period: { id: string }) => period.id === periodId),
    ).toMatchObject({ scheduled: false, active: true });
    expect(
      after.periods.filter((period: { active: boolean }) => period.active),
    ).toHaveLength(1);
    expect(after.attendance).toContainEqual({
      periodId,
      studentId,
      status: "present",
    });
    const reportAfter = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${room.id}/reports?range=all`,
        cookies: { session },
      })
    ).json();
    expect(
      reportAfter.periods.some(
        (period: { id: string }) => period.id === periodId,
      ),
    ).toBe(true);
  });

  it("enforces lifecycle transitions, live writes, reopen corrections, and attendance checkpoints", async () => {
    const server = await app();
    const session = await signup(server, "lifecycle@example.com");
    const room = await createClass(server, session);
    const studentId = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/roster`,
        cookies: { session },
        payload: { students: [{ displayName: "Avery" }] },
      })
    ).json().created[0] as string;
    const first = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${room.id}/snapshot`,
        cookies: { session },
      })
    ).json().periods[0];
    const second = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/periods`,
        cookies: { session },
        payload: { label: "Second" },
      })
    ).json();
    let snapshot = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${room.id}/snapshot`,
        cookies: { session },
      })
    ).json();
    expect(
      snapshot.periods.filter(
        (period: { status: string }) => period.status === "live",
      ),
    ).toHaveLength(1);
    expect(
      snapshot.periods.find((period: { id: string }) => period.id === first.id)
        .status,
    ).toBe("closed");

    const bulk = await server.inject({
      method: "PUT",
      url: `/api/classes/${room.id}/periods/${second.id}/attendance`,
      cookies: { session },
      payload: { status: "absent", studentIds: [studentId] },
    });
    expect(bulk.statusCode).toBe(200);
    const complete = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/periods/${second.id}/attendance/complete`,
      cookies: { session },
    });
    expect(complete.statusCode).toBe(200);
    await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/periods/${second.id}/finish`,
      cookies: { session },
    });
    expect(
      (
        await server.inject({
          method: "POST",
          url: `/api/classes/${room.id}/events`,
          cookies: { session },
          payload: { studentId, periodId: second.id, type: "part+" },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await server.inject({
          method: "PUT",
          url: `/api/classes/${room.id}/attendance/${studentId}`,
          cookies: { session },
          payload: { periodId: second.id, status: "present" },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await server.inject({
          method: "PATCH",
          url: `/api/classes/${room.id}/periods/${second.id}`,
          cookies: { session },
          payload: { active: true },
        })
      ).statusCode,
    ).toBe(409);

    expect(
      (
        await server.inject({
          method: "POST",
          url: `/api/classes/${room.id}/periods/${second.id}/reopen`,
          cookies: { session },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await server.inject({
          method: "PUT",
          url: `/api/classes/${room.id}/attendance/${studentId}`,
          cookies: { session },
          payload: { periodId: second.id, status: "present" },
        })
      ).statusCode,
    ).toBe(200);
    snapshot = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${room.id}/snapshot`,
        cookies: { session },
      })
    ).json();
    expect(
      snapshot.periods.find(
        (period: { id: string }) => period.id === second.id,
      ),
    ).toMatchObject({
      status: "live",
      attendanceCompletedAt: complete.json().attendanceCompletedAt,
    });
    expect(
      snapshot.periods.find((period: { id: string }) => period.id === second.id)
        .reopenedAt,
    ).toBeTruthy();
    expect(snapshot.attendance).toContainEqual({
      periodId: second.id,
      studentId,
      status: "present",
    });
  });

  it("isolates lifecycle transitions and attendance checkpoints by teacher", async () => {
    const server = await app();
    const owner = await signup(server, "lifecycle-owner@example.com");
    const other = await signup(server, "lifecycle-other@example.com");
    const room = await createClass(server, owner);
    const period = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${room.id}/snapshot`,
        cookies: { session: owner },
      })
    ).json().periods[0];
    for (const path of [
      `/periods/${period.id}/finish`,
      `/periods/${period.id}/attendance/complete`,
    ]) {
      expect(
        (
          await server.inject({
            method: "POST",
            url: `/api/classes/${room.id}${path}`,
            cookies: { session: other },
          })
        ).statusCode,
      ).toBe(404);
    }
    expect(
      (
        await server.inject({
          method: "PUT",
          url: `/api/classes/${room.id}/periods/${period.id}/attendance`,
          cookies: { session: other },
          payload: { status: "present" },
        })
      ).statusCode,
    ).toBe(404);
  });

  it("stores sensitive photo evidence with strict ownership and teacher-only access", async () => {
    const server = await app();
    const owner = await signup(server, "photo-owner@example.com");
    const other = await signup(server, "photo-other@example.com");
    const room = await createClass(server, owner, "Photo class");
    const otherRoom = await createClass(server, other, "Other class");
    const studentId = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/roster`,
        cookies: { session: owner },
        payload: { students: [{ displayName: "Avery" }] },
      })
    ).json().created[0] as string;
    const otherStudentId = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${otherRoom.id}/roster`,
        cookies: { session: other },
        payload: { students: [{ displayName: "Jordan" }] },
      })
    ).json().created[0] as string;
    const skillId = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/skills`,
        cookies: { session: owner },
        payload: { label: "Observe" },
      })
    ).json().id as string;
    const otherSkillId = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${otherRoom.id}/skills`,
        cookies: { session: other },
        payload: { label: "Other" },
      })
    ).json().id as string;
    const image = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
    ]);

    for (const [student, skill] of [
      [otherStudentId, skillId],
      [studentId, otherSkillId],
    ]) {
      const mismatch = await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/students/${student}/skills/${skill}/photos`,
        cookies: { session: owner },
        headers: { "content-type": "image/png" },
        payload: image,
      });
      expect(mismatch.statusCode).toBe(404);
    }
    const created = await server.inject({
      method: "POST",
      url: `/api/classes/${room.id}/students/${studentId}/skills/${skillId}/photos`,
      cookies: { session: owner },
      headers: { "content-type": "image/png", "x-filename": "work.png" },
      payload: image,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      classId: room.id,
      studentId,
      skillId,
      originalFilename: "work.png",
      sensitivity: "sensitive teacher-only evidence",
    });
    expect(JSON.stringify(created.json())).not.toContain(photoDirs[0]);
    const photoId = created.json().id as string;

    const list = await server.inject({
      method: "GET",
      url: `/api/classes/${room.id}/photos?studentId=${studentId}&skillId=${skillId}`,
      cookies: { session: owner },
    });
    expect(list.json()).toMatchObject({
      access: "teacher-only",
      sensitivity: "sensitive teacher-only evidence",
      photos: [expect.objectContaining({ id: photoId })],
    });
    expect(
      (
        await server.inject({
          method: "GET",
          url: `/api/classes/${room.id}/photos`,
          cookies: { session: other },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await server.inject({
          method: "GET",
          url: `/api/classes/${room.id}/photos/${photoId}/image`,
          cookies: { session: other },
        })
      ).statusCode,
    ).toBe(404);

    const streamed = await server.inject({
      method: "GET",
      url: `/api/classes/${room.id}/photos/${photoId}/image`,
      cookies: { session: owner },
    });
    expect(streamed.statusCode).toBe(200);
    expect(streamed.headers["cache-control"]).toContain("private, no-store");
    expect(streamed.rawPayload).toEqual(image);
    expect(
      (
        await server.inject({
          method: "GET",
          url: `/api/student/photos/${photoId}`,
        })
      ).statusCode,
    ).toBe(404);

    expect(
      (
        await server.inject({
          method: "DELETE",
          url: `/api/classes/${room.id}/photos/${photoId}`,
          cookies: { session: other },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await server.inject({
          method: "DELETE",
          url: `/api/classes/${room.id}/photos/${photoId}`,
          cookies: { session: owner },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await server.inject({
          method: "GET",
          url: `/api/classes/${room.id}/photos/${photoId}/image`,
          cookies: { session: owner },
        })
      ).statusCode,
    ).toBe(404);
  });

  it("rejects invalid photo MIME and size and exports only a photo manifest", async () => {
    const server = await app();
    const session = await signup(server, "photo-validation@example.com");
    const room = await createClass(server, session);
    const studentId = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/roster`,
        cookies: { session },
        payload: { students: [{ displayName: "Avery" }] },
      })
    ).json().created[0] as string;
    const skillId = (
      await server.inject({
        method: "POST",
        url: `/api/classes/${room.id}/skills`,
        cookies: { session },
        payload: { label: "Observe" },
      })
    ).json().id as string;
    const url = `/api/classes/${room.id}/students/${studentId}/skills/${skillId}/photos`;
    expect(
      (
        await server.inject({
          method: "POST",
          url,
          cookies: { session },
          headers: { "content-type": "image/png" },
          payload: Buffer.from("not a png"),
        })
      ).statusCode,
    ).toBe(415);
    expect(
      (
        await server.inject({
          method: "POST",
          url,
          cookies: { session },
          headers: { "content-type": "image/jpeg" },
          payload: Buffer.concat([
            Buffer.from([0xff, 0xd8, 0xff]),
            Buffer.alloc(5 * 1024 * 1024),
          ]),
        })
      ).statusCode,
    ).toBe(413);
    const image = Buffer.from([0xff, 0xd8, 0xff, 1]);
    expect(
      (
        await server.inject({
          method: "POST",
          url,
          cookies: { session },
          headers: { "content-type": "image/jpeg" },
          payload: image,
        })
      ).statusCode,
    ).toBe(201);
    const backup = (
      await server.inject({
        method: "GET",
        url: `/api/classes/${room.id}/export/json`,
        cookies: { session },
      })
    ).json();
    expect(backup.photoEvidence).toMatchObject({
      binaryMediaIncluded: false,
      sensitivity: "sensitive teacher-only evidence",
    });
    expect(backup.photoEvidence.manifest).toHaveLength(1);
    expect(JSON.stringify(backup.photoEvidence)).not.toContain(
      image.toString("base64"),
    );
    const studentAccess = (
      await server.inject({
        method: "POST",
        url: `/api/student/join/${room.joinCode}/select`,
        payload: { studentId },
      })
    ).cookies.find((cookie) => cookie.name === "student_access")!.value;
    expect(
      JSON.stringify(
        (
          await server.inject({
            method: "GET",
            url: "/api/student/me",
            cookies: { student_access: studentAccess },
          })
        ).json(),
      ),
    ).not.toContain("photo");
  });

  it("exports structured reports safely and restores request history", async () => {
    const server = await app();
    const owner = await signup(server, "export@example.com");
    const other = await signup(server, "restore@example.com");
    const room = await createClass(server, owner);
    const studentId = (await server.inject({ method: "POST", url: `/api/classes/${room.id}/roster`, cookies: { session: owner }, payload: { students: [{ displayName: "=SUM(1,1)" }] } })).json().created[0];
    const parent = (await server.inject({ method: "POST", url: `/api/classes/${room.id}/skills`, cookies: { session: owner }, payload: { label: "+Parent" } })).json();
    const leaf = (await server.inject({ method: "POST", url: `/api/classes/${room.id}/skills`, cookies: { session: owner }, payload: { label: "Leaf", parentSkillId: parent.id } })).json();
    await server.inject({ method: "PUT", url: `/api/classes/${room.id}/mastery/${studentId}/${leaf.id}`, cookies: { session: owner }, payload: { achievement: "exceeds", requiresSupport: true } });
    const snapshot = (await server.inject({ method: "GET", url: `/api/classes/${room.id}/snapshot`, cookies: { session: owner } })).json();
    const access = (await server.inject({ method: "POST", url: `/api/student/join/${room.joinCode}/select`, payload: { studentId } })).cookies.find((cookie) => cookie.name === "student_access")!.value;
    const requestId = (await server.inject({ method: "POST", url: `/api/student/requests/${snapshot.requestTypes[0].id}`, cookies: { student_access: access } })).json().id;
    await server.inject({ method: "POST", url: `/api/classes/${room.id}/requests/${requestId}/resolve`, cookies: { session: owner } });

    const csv = await server.inject({ method: "GET", url: `/api/classes/${room.id}/reports/export/csv?range=all`, cookies: { session: owner } });
    expect(csv.body).toContain("[Parent Skills]");
    expect(csv.body).toContain("Total,Evidence,Meet or exceed,Requires support,Not started");
    expect(csv.body).toContain("[Leaf Achievements]");
    expect(csv.body).toContain("[Request History]");
    expect(csv.body).not.toMatch(/percent|scalar/i);
    expect(csv.body).toContain("'=SUM(1,1)");
    expect(csv.body).toContain("'+Parent");
    const xlsx = await server.inject({ method: "GET", url: `/api/classes/${room.id}/reports/export/xlsx?range=all`, cookies: { session: owner } });
    const workbook = XLSX.read(xlsx.rawPayload, { type: "buffer" });
    expect(workbook.SheetNames).toEqual(expect.arrayContaining(["Parent Skills", "Leaf Achievements", "Request History", "Photo Evidence"]));
    expect(workbook.Sheets["Leaf Achievements"].A2.v).toBe("'=SUM(1,1)");

    const backup = (await server.inject({ method: "GET", url: `/api/classes/${room.id}/export/json`, cookies: { session: owner } })).json();
    expect(JSON.stringify(backup)).not.toMatch(/unitLabel|\bUnit\b|project/i);
    const restored = await server.inject({ method: "POST", url: "/api/import/json", cookies: { session: other }, payload: backup });
    const restoredSnapshot = (await server.inject({ method: "GET", url: `/api/classes/${restored.json().classId}/snapshot`, cookies: { session: other } })).json();
    expect(restoredSnapshot.requestHistory).toHaveLength(1);
    expect(restoredSnapshot.mastery[0]).toMatchObject({ achievement: "exceeds", requiresSupport: true });
    expect(restoredSnapshot.classRoom.activeLens).toBe(backup.classRoom.activeLens);
    expect(restoredSnapshot.classRoom.settings).toEqual(backup.classRoom.settings);
    expect(restoredSnapshot.students[0].id).not.toBe(studentId);
    expect(restoredSnapshot.requestHistory[0].resolvedBy).toBeTruthy();
    expect(restoredSnapshot).not.toHaveProperty("photoEvidence");
    expect((await server.inject({ method: "GET", url: `/api/classes/${restored.json().classId}/snapshot`, cookies: { session: owner } })).statusCode).toBe(404);
  });
});
