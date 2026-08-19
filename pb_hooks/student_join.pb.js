/// <reference path="../pb_data/types.d.ts" />

// Student access is deliberately narrower than the teacher collection rules.
// This route only reveals the public roster fields needed to choose a classroom
// tile; private evidence remains protected by the collection API rules.
routerAdd("GET", "/api/tap-to-track/join/{code}", (event) => {
  const code = event.request.pathValue("code").trim().toUpperCase();
  const classroom = $app.findFirstRecordByFilter(
    "classes",
    "joinCode = {:code}",
    { code },
  );
  const students = $app.findRecordsByFilter(
    "class_records",
    "class = {:classId} && kind = 'student'",
    "created",
    250,
    0,
    { classId: classroom.id },
  );

  return event.json(200, {
    classRoom: { id: classroom.id, name: classroom.getString("name") },
    students: students.map((record) => {
      const value = record.get("payload") || {};
      return {
        id: record.id,
        displayName: value.displayName,
        avatar: value.avatar,
      };
    }),
  });
});
