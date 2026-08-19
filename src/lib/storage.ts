import type { AppData } from "$lib/types";

const key = "tap-to-track-data-v2";

export function starterData(): AppData {
  return {
    activeClassId: "demo-class",
    day: new Date().toISOString().slice(0, 10),
    classes: [{
      id: "demo-class",
      name: "My class",
      students: ["Avery", "Jordan", "Kai", "Morgan", "Riley", "Sam"].map((name) => ({
        id: crypto.randomUUID(), name, attendance: "present", positive: 0, redirect: 0,
      })),
    }],
  };
}

export function loadData(): AppData {
  const saved = localStorage.getItem(key);
  if (!saved) return starterData();
  try { return JSON.parse(saved) as AppData; } catch { return starterData(); }
}

export function saveData(data: AppData) {
  localStorage.setItem(key, JSON.stringify(data));
}
