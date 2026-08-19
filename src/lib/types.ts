export type Student = {
  id: string;
  name: string;
  attendance: "present" | "absent";
  positive: number;
  redirect: number;
};

export type ClassRoom = { id: string; name: string; students: Student[] };

export type AppData = {
  classes: ClassRoom[];
  activeClassId: string;
  day: string;
};
