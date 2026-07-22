export interface ClassSettings {
  archived: boolean;
  layout: "grid" | "map";
  participationWatchAfter: number | null;
  participationCheckInAfter: number | null;
}

export const defaultClassSettings: ClassSettings = {
  archived: false,
  layout: "grid",
  participationWatchAfter: 2,
  participationCheckInAfter: 3,
};

export function classSettings(value: unknown): ClassSettings {
  const saved = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<ClassSettings>
    : {};
  return {
    archived: Boolean(saved.archived),
    layout: saved.layout === "map" ? "map" : "grid",
    participationWatchAfter: saved.participationWatchAfter === null || typeof saved.participationWatchAfter === "number" ? saved.participationWatchAfter : defaultClassSettings.participationWatchAfter,
    participationCheckInAfter: saved.participationCheckInAfter === null || typeof saved.participationCheckInAfter === "number" ? saved.participationCheckInAfter : defaultClassSettings.participationCheckInAfter,
  };
}

export function participationThreshold(value: unknown, name: string): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 100) {
    throw new Error(`${name} must be an integer from 1 to 100 or null`);
  }
  return Number(value);
}

export function validateParticipationThresholds(settings: Pick<ClassSettings, "participationWatchAfter" | "participationCheckInAfter">) {
  if (settings.participationWatchAfter !== null && settings.participationCheckInAfter !== null
    && settings.participationCheckInAfter < settings.participationWatchAfter) {
    throw new Error("Check in must be greater than or equal to Watch");
  }
  return settings;
}
