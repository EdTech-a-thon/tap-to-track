import type { ClassSettings } from "./classSettings";

export type ParticipationGuidanceLevel = "check-in" | "watch" | "on-track";

export function participationGuidanceLevel(
  eligibleDaysSincePositive: number,
  settings: Pick<ClassSettings, "participationWatchAfter" | "participationCheckInAfter">,
): ParticipationGuidanceLevel {
  if (settings.participationCheckInAfter !== null && eligibleDaysSincePositive >= settings.participationCheckInAfter) return "check-in";
  if (settings.participationWatchAfter !== null && eligibleDaysSincePositive >= settings.participationWatchAfter) return "watch";
  return "on-track";
}
