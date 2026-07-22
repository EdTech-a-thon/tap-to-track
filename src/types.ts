import type { ClassSettings } from "./classSettings";

export type Lens = "participation" | "skills";
export type Achievement = "not_started" | "approaching" | "meets" | "exceeds";
// Existing screens use these display states until their broader Phase 3 redesign.
export type SkillState = "none" | "working" | "mastered";
export interface ParentSummary {
  total: number;
  evidenceCount: number;
  meetOrExceedCount: number;
  requiresSupportCount: number;
  notStartedCount: number;
}
export type AttendanceStatus = "present" | "absent";
export type PeriodStatus = "scheduled" | "live" | "closed";

export interface ClassRoom {
  id: string;
  name: string;
  activeLens: Lens;
  joinCode: string;
  createdAt: string;
  settings: ClassSettings;
}
export interface Student {
  id: string;
  classId: string;
  displayName: string;
  avatar: { emoji: string; color: string; shape: string };
  tags: string[];
  archived: boolean;
  enrolledAt?: string;
  archivedAt?: string | null;
  x?: number;
  y?: number;
}
export interface Skill {
  id: string;
  classId: string;
  label: string;
  category: string;
  order: number;
  visibleToStudents: boolean;
  parentSkillId: string | null;
  shell?: boolean;
}
export interface Mastery {
  studentId: string;
  skillId: string;
  achievement: Achievement;
  requiresSupport: boolean;
  updatedAt: string;
  derived?: boolean;
}
export type PeriodType =
  "instructional" | "independent" | "assessment" | "no-participation";
export interface Period {
  id: string;
  classId: string;
  label: string;
  startedAt: string;
  endedAt: string | null;
  status: PeriodStatus;
  active: boolean;
  scheduled?: boolean;
  attendanceCompletedAt: string | null;
  reopenedAt: string | null;
  type?: PeriodType;
  participationExpected?: boolean;
  teacherNote?: string | null;
}
export interface Attendance {
  periodId: string;
  studentId: string;
  status: AttendanceStatus;
}
export interface Event {
  id: string;
  classId: string;
  studentId: string;
  periodId: string;
  type: "part+" | "part-" | "request";
  requestTypeId?: string;
  timestamp: string;
}
export interface ParticipationAction {
  id: string;
  type: "part+" | "part-";
  timestamp: string;
  studentId: string;
  displayName: string;
  periodId: string;
  classDayLabel: string;
  classDayStartedAt: string;
  periodStatus: PeriodStatus;
}
export interface ClassTimer {
  classId: string;
  periodId: string;
  status: "running" | "paused" | "stopped" | "finished";
  label: string;
  durationSeconds: number;
  endsAt: string | null;
  remainingSeconds: number;
  revision: number;
  updatedAt: string;
}
export interface AllClassProgressRow {
  studentId: string; displayName: string; classId: string; className: string;
  eligibleDays: number; positiveActionDays: number; absenceCount: number; enrolledClassDays: number;
  evidenceCount: number; totalSkills: number; meetOrExceedCount: number; supportCount: number; lastActionAt: string | null;
}
export interface RequestType {
  id: string;
  classId: string;
  label: string;
  color: string;
  behavior: "attention" | "presence" | "completion" | "custom";
  resolveLabel: string;
}
export interface RequestStatus {
  id: string;
  studentId: string;
  requestTypeId: string;
  status: "active" | "acknowledged" | "resolved" | "cancelled";
  behavior: RequestType["behavior"];
  joinedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  cancelledAt: string | null;
  resolvedBy: string | null;
  updatedAt: string;
  wait: number;
}
export interface Tag {
  id: string;
  classId: string;
  label: string;
}
export interface MasteryEvent {
  id: string;
  studentId: string;
  skillId: string;
  previousAchievement: Achievement;
  achievement: Achievement;
  previousRequiresSupport: boolean;
  requiresSupport: boolean;
  timestamp: string;
  periodId: string | null;
  skillLabel: string;
  category: string;
  note?: string | null;
}
export interface SkillPhoto {
  id: string;
  classId: string;
  studentId: string;
  skillId: string;
  periodId: string | null;
  assessedAt: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  originalFilename: string | null;
  createdAt: string;
  sensitivity: string;
  imageUrl: string;
}
export interface ClassSnapshot {
  classRoom: ClassRoom;
  students: Student[];
  skills: Skill[];
  mastery: Mastery[];
  masteryEvents?: MasteryEvent[];
  periods: Period[];
  attendance: Attendance[];
  events: Event[];
  requestTypes: RequestType[];
  requests: RequestStatus[];
  requestHistory?: Omit<RequestStatus, "behavior" | "wait">[];
  tags: Tag[];
}

export interface ReportStudent {
  studentId: string;
  displayName: string;
  tags: string[];
  enrolledAt: string;
  archived: boolean;
  archivedAt: string | null;
  enrolledPeriods: number;
  attendedClassDays: number;
  attendedInstructionalExpectedPeriods: number;
  participationEligiblePeriods: number;
  participatedPeriods: number;
  periodsSincePositive: number | null;
  lastActionAt: string | null;
  positives: number;
  redirects: number;
  absences: number;
  photoEvidenceCount: number;
  achievementSummary: ParentSummary;
  masteryHistory: MasteryEvent[];
}
export interface ReportSkill {
  id: string;
  label: string;
  category: string;
  parentSkillId: string | null;
  isParent: boolean;
  visibleToStudents?: boolean;
  achievements?: {
    studentId: string;
    achievement: Achievement;
    requiresSupport: boolean;
  }[];
  summaries?: { studentId: string; summary: ParentSummary }[];
  distribution?: Record<Achievement, number>;
  supportCount?: number;
  trends?: Record<Achievement | "requiresSupport", number>;
}
export interface ClassReport {
  classRoom: { id: string; name: string; settings: ClassSettings };
  filters: Record<string, unknown>;
  periods: Period[];
  asOf: string;
  historicalMasteryReconstructable: boolean;
  photoEvidenceCount: number;
  photoEvidence: {
    id: string;
    studentId: string;
    skillId: string;
    periodId: string | null;
    assessedAt: string;
    mimeType: string;
    originalFilename: string | null;
    createdAt: string;
  }[];
  students: ReportStudent[];
  skills: ReportSkill[];
  masteryEvents: MasteryEvent[];
  requestHistory: (Omit<RequestStatus, "wait"> & {
    requestTypeLabel: string;
  })[];
  equity: {
    tag: string;
    students: number;
    positives: number;
    redirects: number;
  }[];
}

export function skillState(
  skills: Skill[],
  mastery: Mastery[],
  studentId: string,
  skillId: string,
): SkillState {
  const achievement =
    mastery.find(
      (item) => item.studentId === studentId && item.skillId === skillId,
    )?.achievement ?? "not_started";
  return achievement === "not_started"
    ? "none"
    : achievement === "approaching"
      ? "working"
      : "mastered";
}

export function topLevelSkills(skills: Skill[]) {
  return skills.filter((skill) => !skill.parentSkillId);
}
