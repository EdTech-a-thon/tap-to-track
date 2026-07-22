import { create } from "zustand";
import type { ClassRoom, ClassSnapshot, Lens } from "./types";
import { teacherView, type TeacherView } from "./navigation";

type AppState = {
  classes: ClassRoom[];
  snapshot?: ClassSnapshot;
  classId: string;
  view: TeacherView;
  lens: Lens;
  loading: boolean;
  error: string;
  setClasses: (classes: ClassRoom[]) => void;
  setSnapshot: (snapshot: ClassSnapshot) => void;
  setClassId: (classId: string) => void;
  setView: (view: TeacherView) => void;
  setLens: (lens: Lens) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
};

export const useApp = create<AppState>((set) => ({
  classes: [],
  classId: localStorage.getItem("tap-class") ?? "",
  view: teacherView(localStorage.getItem("tap-view")),
  lens: "participation",
  loading: true,
  error: "",
  setClasses: (classes) => set({ classes }),
  setSnapshot: (snapshot) =>
    set({ snapshot, lens: snapshot.classRoom.activeLens }),
  setClassId: (classId) => {
    localStorage.setItem("tap-class", classId);
    set({ classId, snapshot: undefined });
  },
  setView: (view) => {
    localStorage.setItem("tap-view", view);
    set({ view });
  },
  setLens: (lens) => set({ lens }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
