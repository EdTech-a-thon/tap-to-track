export type TeacherView = "today" | "classes" | "insights";
export type TodayNavigationIntent = { classId: string; periodId?: string };
const todayIntentKey = "tap-today-intent";

const legacyViews: Record<string, TeacherView> = {
  live: "today",
  progress: "insights",
  manage: "classes",
};

export function teacherView(value: string | null): TeacherView {
  if (value === "today" || value === "classes" || value === "insights") return value;
  return value ? legacyViews[value] ?? "today" : "today";
}

export function setTodayNavigationIntent(intent: TodayNavigationIntent) {
  sessionStorage.setItem(todayIntentKey, JSON.stringify(intent));
}

export function takeTodayNavigationIntent(): TodayNavigationIntent | undefined {
  const value = sessionStorage.getItem(todayIntentKey);
  sessionStorage.removeItem(todayIntentKey);
  if (!value) return;
  try {
    const intent = JSON.parse(value) as Partial<TodayNavigationIntent>;
    if (typeof intent.classId === "string" && (intent.periodId === undefined || typeof intent.periodId === "string")) return intent as TodayNavigationIntent;
  } catch { /* Ignore an invalid old intent. */ }
}
