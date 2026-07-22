import { forwardRef, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type ChangeEvent, type ForwardedRef, type ReactNode } from "react";
import { achievementDisplay, achievementOptions, assessableSkills, parentSummary, parentSummaryText, rapidAssessmentReducer } from "../assessment";
import { dataStore, RequestError } from "../data";
import { participationInsights } from "../participation";
import { groupRequestLanes, requestAlert, unseenRequestIds } from "../requestRail";
import {
  exactStudentId,
  filterRoster,
  changeRosterDensity,
  firstStudentIdForInitial,
  rosterDensity,
  rosterDensityLabel,
  rosterInitials,
  type RosterDensity,
  type RosterFilter,
} from "../roster";
import { useApp } from "../state";
import { centerSeats, clampSeat, defaultSeatPositions, fitSeats, logicalRoomForZoom, screenToSeat, seatBounds, SEAT_CARD_HEIGHT, SEAT_CARD_WIDTH, SEAT_PADDING, unionSeatBounds } from "../seating";
import { topLevelSkills, type Achievement, type Lens, type PeriodType, type Student } from "../types";
import { StudentGrid, StudentTile } from "./StudentGrid";

type SeatingOrientation = "landscape" | "portrait";
type SeatingView = { scale: number; fit: boolean };

const seatingOrientation = (): SeatingOrientation =>
  matchMedia("(orientation: landscape)").matches ? "landscape" : "portrait";

function savedSeatingView(classId: string, orientation: SeatingOrientation): SeatingView {
  try {
    const saved = JSON.parse(localStorage.getItem(`seating-view:${classId}:${orientation}`) ?? "") as Partial<SeatingView>;
    if (typeof saved.fit === "boolean" && typeof saved.scale === "number" && Number.isFinite(saved.scale) && saved.scale >= 0.05 && saved.scale <= 1.5) {
      return { fit: saved.fit, scale: saved.scale };
    }
  } catch {
    // A malformed saved view should fall back to the default fitted view.
  }
  const legacyScale = Number(localStorage.getItem(`seating-zoom:${classId}`));
  if (Number.isFinite(legacyScale) && legacyScale >= 0.05 && legacyScale <= 1.5) {
    return { fit: false, scale: legacyScale };
  }
  return { fit: true, scale: 1 };
}

function saveSeatingView(classId: string, orientation: SeatingOrientation, view: SeatingView) {
  localStorage.setItem(`seating-view:${classId}:${orientation}`, JSON.stringify(view));
}

export function Live({ initialPeriodId = "", onBack }: { initialPeriodId?: string; onBack?: () => void }) {
  const { snapshot, lens, setLens, setSnapshot, setError } = useApp();
  const [attendanceMode, setAttendanceMode] = useState(false);
  const [mapMode, setMapMode] = useState(
    snapshot?.classRoom.settings.layout === "map",
  );
  const [arranging, setArranging] = useState(false);
  const [skillId, setSkillId] = useState("");
  const [skillStudentId, setSkillStudentId] = useState("");
  const [assessmentStudentId, setAssessmentStudentId] = useState("");
  const [rapid, dispatchRapid] = useReducer(rapidAssessmentReducer, { status: "idle", target: "meets" });
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkTarget, setBulkTarget] = useState<Achievement>("meets");
  const [bulkNote, setBulkNote] = useState("");
  const [lastBulkAssignment, setLastBulkAssignment] = useState<{ skillId: string; learners: { studentId: string; achievement: Achievement; requiresSupport: boolean }[] }>();
  const [assessmentSkillId, setAssessmentSkillId] = useState("");
  const [feedback, setFeedback] = useState<{
    studentId: string;
    type: "positive" | "redirect";
  }>();
  const [lastAction, setLastAction] = useState<{
    studentId: string;
    type: "part+" | "part-";
  }>();
  const [focusOrder, setFocusOrder] = useState(false);
  const [viewPeriodId, setViewPeriodId] = useState(initialPeriodId);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState(false);
  const [rosterQuery, setRosterQuery] = useState("");
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>("all");
  const [density, setDensity] = useState<RosterDensity>(() => {
    const saved = snapshot
      ? localStorage.getItem(`roster-density:${snapshot.classRoom.id}`)
      : null;
    return saved === "comfortable" || saved === "compact" || saved === "overview"
      ? saved
      : rosterDensity(snapshot?.students.filter((student) => !student.archived).length ?? 0, matchMedia("(orientation: landscape)").matches);
  });
  const [highlightedStudentId, setHighlightedStudentId] = useState("");
  const [actionStudentId, setActionStudentId] = useState("");
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [mapScale, setMapScale] = useState(1);
  const [fitMap, setFitMap] = useState(true);
  const [mapOrientation, setMapOrientation] = useState<SeatingOrientation>(seatingOrientation);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [finishAttendanceWarning, setFinishAttendanceWarning] = useState(false);
  const [reopenWarning, setReopenWarning] = useState(false);
  const [mapViewportSize, setMapViewportSize] = useState({ width: 0, height: 0 });
  const rosterStartRef = useRef<HTMLElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const mapCanvasRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: SEAT_CARD_WIDTH / 2, y: SEAT_CARD_HEIGHT / 2 });
  useEffect(() => {
    const openSeating = sessionStorage.getItem("open-seating-arrange") === snapshot?.classRoom.id;
    if (openSeating) sessionStorage.removeItem("open-seating-arrange");
    setAttendanceMode(false);
    setSkillId("");
    setSkillStudentId("");
    setAssessmentStudentId("");
    setAssessmentSkillId("");
    dispatchRapid({ type: "exit" });
    setBulkMode(false);
    setBulkSelectedIds(new Set());
    setLastBulkAssignment(undefined);
    setArranging(openSeating);
    setFocusOrder(false);
    setViewPeriodId(initialPeriodId);
    setMoreOpen(false);
    setRosterQuery("");
    setRosterFilter("all");
    setHighlightedStudentId("");
    setActionStudentId("");
    setMapMode(openSeating || snapshot?.classRoom.settings.layout === "map");
    const orientation = seatingOrientation();
    setMapOrientation(orientation);
    setMapScale(1);
    setFitMap(true);
    const savedDensity = snapshot
      ? localStorage.getItem(`roster-density:${snapshot.classRoom.id}`)
      : null;
    setDensity(
      savedDensity === "comfortable" || savedDensity === "compact" || savedDensity === "overview"
        ? savedDensity
        : rosterDensity(snapshot?.students.filter((student) => !student.archived).length ?? 0, matchMedia("(orientation: landscape)").matches),
    );
  }, [snapshot?.classRoom.id, initialPeriodId]);
  useEffect(() => {
    const classId = snapshot?.classRoom.id;
    if (!classId) return;
    const restoreOrientationView = () => {
      const orientation = seatingOrientation();
      setMapOrientation(orientation);
      const savedView = savedSeatingView(classId, orientation);
      setMapScale(savedView.scale);
      setFitMap(savedView.fit);
    };
    const orientationQuery = matchMedia("(orientation: landscape)");
    orientationQuery.addEventListener("change", restoreOrientationView);
    window.addEventListener("orientationchange", restoreOrientationView);
    return () => {
      orientationQuery.removeEventListener("change", restoreOrientationView);
      window.removeEventListener("orientationchange", restoreOrientationView);
    };
  }, [snapshot?.classRoom.id]);
  useEffect(() => {
    const updateBackToTop = () => setShowBackToTop(scrollY > 700);
    updateBackToTop();
    addEventListener("scroll", updateBackToTop, { passive: true });
    return () => removeEventListener("scroll", updateBackToTop);
  }, []);
  useEffect(() => {
    dispatchRapid({ type: "exit" });
    setBulkMode(false);
    setAssessmentStudentId("");
    setAssessmentSkillId("");
    setBulkSelectedIds(new Set());
    setLastBulkAssignment(undefined);
  }, [skillId, viewPeriodId, lens]);
  useEffect(() => {
    const viewport = mapViewportRef.current;
    if (!mapMode || !viewport) return;
    const measure = () => {
      if (!mapFullscreen) {
        const browserHeight = window.visualViewport?.height ?? window.innerHeight;
        const availableHeight = Math.max(180, browserHeight - viewport.getBoundingClientRect().top - 12);
        viewport.style.height = `${Math.min(500, availableHeight)}px`;
      }
      setMapViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    window.visualViewport?.addEventListener("resize", measure);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener("resize", measure);
      window.removeEventListener("resize", measure);
    };
  }, [mapMode, mapFullscreen]);
  useEffect(() => {
    if (!mapFullscreen) return;
    const exit = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMapFullscreen(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
    document.body.classList.add("seating-fullscreen-open");
    addEventListener("keydown", exit);
    return () => {
      document.body.classList.remove("seating-fullscreen-open");
      removeEventListener("keydown", exit);
    };
  }, [mapFullscreen]);
  useEffect(() => {
    const syncFullscreen = () => {
      if (!document.fullscreenElement) setMapFullscreen(false);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  const prepared = useMemo(() => {
    if (!snapshot) return null;
    const activePeriod = snapshot.periods.find((item) => item.status === "live");
    const period = snapshot.periods.find((item) => item.id === viewPeriodId) ?? activePeriod;
    const activeStudents = snapshot.students.filter((student) => !student.archived);
    const attendanceByStudent = new Map(
      snapshot.attendance
        .filter((item) => item.periodId === period?.id)
        .map((item) => [item.studentId, item.status]),
    );
    const eventsByStudent = new Map<string, typeof snapshot.events>();
    for (const event of snapshot.events) {
      if (event.periodId !== period?.id) continue;
      const events = eventsByStudent.get(event.studentId) ?? [];
      events.push(event);
      eventsByStudent.set(event.studentId, events);
    }
    const eventCounts = new Map<string, { positive: number; redirect: number }>();
    for (const [studentId, events] of eventsByStudent) {
      eventCounts.set(studentId, {
        positive: events.filter((event) => event.type === "part+").length,
        redirect: events.filter((event) => event.type === "part-").length,
      });
    }
    const requestsByStudent = new Map(snapshot.requests.map((item) => [item.studentId, item]));
    const requestTypesById = new Map(snapshot.requestTypes.map((item) => [item.id, item]));
    const masteryByStudentSkill = new Map(snapshot.mastery.map((item) => [`${item.studentId}\u0000${item.skillId}`, item]));
    const parentSkills = topLevelSkills(snapshot.skills);
    const assessedSkills = assessableSkills(snapshot.skills);
    const masteryCounts = new Map<string, number>();
    for (const student of activeStudents) {
      masteryCounts.set(
        student.id,
        assessedSkills.filter((skill) => {
          const achievement = masteryByStudentSkill.get(`${student.id}\u0000${skill.id}`)?.achievement;
          return achievement === "meets" || achievement === "exceeds";
        }).length,
      );
    }
    const insights = participationInsights(activeStudents, snapshot.periods, snapshot.attendance, snapshot.events, snapshot.classRoom.settings);
    const insightsByStudent = new Map(insights.map((item) => [item.studentId, item]));
    const notHeard = new Set(
      activeStudents
        .filter((student) => (eventCounts.get(student.id)?.positive ?? 0) === 0 && (attendanceByStudent.get(student.id) ?? "present") === "present")
        .map((student) => student.id),
    );
    const checkIn = new Set(insights.filter((item) => item.status === "needs-attention").map((item) => item.studentId));
    let visibleStudents = mapMode
      ? activeStudents
      : filterRoster(activeStudents, rosterQuery, rosterFilter, notHeard, checkIn);
    if (focusOrder && !mapMode && lens === "participation") {
      const rank = { "needs-attention": 0, building: 1, new: 2, regular: 3 };
      visibleStudents = [...visibleStudents].sort((a, b) =>
        rank[insightsByStudent.get(a.id)!.status] - rank[insightsByStudent.get(b.id)!.status] ||
        a.displayName.localeCompare(b.displayName),
      );
    }
    return { activePeriod, period, activeStudents, attendanceByStudent, eventsByStudent, eventCounts, requestsByStudent, requestTypesById, masteryByStudentSkill, masteryCounts, parentSkills, assessedSkills, insights, insightsByStudent, visibleStudents };
  }, [snapshot, viewPeriodId, mapMode, rosterQuery, rosterFilter, focusOrder, lens]);
  if (!snapshot || !prepared) return null;
  const { activePeriod, period, activeStudents, attendanceByStudent, eventsByStudent, eventCounts, requestsByStudent, requestTypesById, masteryByStudentSkill, masteryCounts, parentSkills, assessedSkills, insights, insightsByStudent, visibleStudents } = prepared;
  const viewingHistory = Boolean(period && period.status !== "live");
  const today = new Date().toDateString();
  const activeIsToday = activePeriod
    ? new Date(activePeriod.startedAt).toDateString() === today
    : false;
  const needsNewDay = Boolean(
    activePeriod && !activeIsToday && !viewingHistory,
  );
  const attendance = (studentId: string) =>
    attendanceByStudent.get(studentId) ?? "present";
  const periodEvents = (studentId: string) =>
    eventsByStudent.get(studentId) ?? [];
  const positives = (studentId: string) =>
    eventCounts.get(studentId)?.positive ?? 0;
  const negatives = (studentId: string) =>
    eventCounts.get(studentId)?.redirect ?? 0;
  const masteryFor = (studentId: string, selectedSkillId: string) =>
    masteryByStudentSkill.get(`${studentId}\u0000${selectedSkillId}`) ?? {
      studentId,
      skillId: selectedSkillId,
      achievement: "not_started" as Achievement,
      requiresSupport: false,
      updatedAt: "",
    };
  const selectedSkill = snapshot.skills.find((item) => item.id === skillId);
  const selectedParent = selectedSkill?.parentSkillId
    ? snapshot.skills.find((item) => item.id === selectedSkill.parentSkillId)
    : selectedSkill;
  const selectedIsParent = Boolean(selectedSkill && snapshot.skills.some((child) => child.parentSkillId === selectedSkill.id));
  const skillCategories = Array.from(
    new Set(parentSkills.map((skill) => skill.category || "General")),
  );
  const masteryProgress = (studentId: string) => masteryCounts.get(studentId) ?? 0;
  const presentCount = activeStudents.filter(
    (student) => attendance(student.id) === "present",
  ).length;
  const absentCount = activeStudents.length - presentCount;
  const insightFor = (studentId: string) =>
    insightsByStudent.get(studentId)!;
  const initials = rosterInitials(activeStudents);
  const wholeClassMode = density === "overview" && !mapMode;
  const defaultPositions = defaultSeatPositions(
    activeStudents.length,
    mapViewportSize.width || 1180,
    mapViewportSize.height || 680,
  );
  const mapPositions = activeStudents.map((student, index) => ({
    x: Math.max(SEAT_PADDING, student.x ?? defaultPositions[index].x),
    y: Math.max(SEAT_PADDING, student.y ?? defaultPositions[index].y),
  }));
  const mapBounds = seatBounds(mapPositions);
  // Keep a small frame around the fitted chart without wasting classroom space.
  const fittedBaseMap = fitSeats(mapBounds, mapViewportSize.width, mapViewportSize.height, mapFullscreen ? 16 : 8);
  const effectiveScale = fitMap ? fittedBaseMap.scale : mapScale;
  const logicalBounds = arranging
    ? unionSeatBounds(logicalRoomForZoom(mapViewportSize.width, mapViewportSize.height, effectiveScale), mapBounds)
    : mapBounds;
  const roomWidth = Math.max(logicalBounds.width, SEAT_CARD_WIDTH + 56);
  const roomHeight = Math.max(logicalBounds.height, SEAT_CARD_HEIGHT + 56);
  const mapTransform = fitMap
    ? fittedBaseMap
    : centerSeats(logicalBounds, mapViewportSize.width, mapViewportSize.height, effectiveScale);

  const scrollToStudent = (studentId: string) => {
    setHighlightedStudentId(studentId);
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        `[data-student-id="${CSS.escape(studentId)}"]`,
      );
      if (!target) return;
      if (mapMode) {
        fitAllSeats();
      } else {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      target.focus({ preventScroll: true });
      window.setTimeout(
        () => setHighlightedStudentId((current) => current === studentId ? "" : current),
        1800,
      );
    });
  };
  const findStudent = (query: string) => {
    setRosterQuery(query);
    const studentId = exactStudentId(activeStudents, query);
    if (!studentId) return;
    setRosterFilter("all");
    scrollToStudent(studentId);
  };
  const jumpToInitial = (initial: string) => {
    const studentId = firstStudentIdForInitial(activeStudents, initial);
    if (!studentId) return;
    setRosterQuery("");
    setRosterFilter("all");
    scrollToStudent(studentId);
  };

  const save = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "That change could not be saved.",
      );
    }
  };
  const updateAttendance = (student: Student) =>
    period &&
    period.status === "live" &&
    save(async () => {
      const optimistic = await dataStore.markAttendance(
        snapshot.classRoom.id,
        period.id,
        student.id,
        attendance(student.id) === "present" ? "absent" : "present",
      );
      setSnapshot(optimistic);
      await dataStore.sync();
    });
  const participate = (student: Student, amount: 1 | -1) =>
    period &&
    period.status === "live" &&
    attendance(student.id) === "present" &&
    save(async () => {
      const next = await dataStore.addParticipation(
        snapshot.classRoom.id,
        period.id,
        student.id,
        amount,
      );
      setSnapshot(next);
      setFeedback({
        studentId: student.id,
        type: amount === 1 ? "positive" : "redirect",
      });
      setLastAction({
        studentId: student.id,
        type: amount === 1 ? "part+" : "part-",
      });
      window.setTimeout(
        () =>
          setFeedback((current) =>
            current?.studentId === student.id ? undefined : current,
          ),
        350,
      );
    });
  const chooseLens = (nextLens: Lens) => {
    setLens(nextLens);
    setAttendanceMode(false);
    setActionStudentId("");
    void save(async () =>
      setSnapshot(
        await dataStore.mutate(
          snapshot.classRoom.id,
          `/classes/${snapshot.classRoom.id}`,
          "PATCH",
          { activeLens: nextLens },
        ),
      ),
    );
  };
  const setAssessment = (student: Student, selectedSkillId: string, update: { achievement?: Achievement; requiresSupport?: boolean; note?: string }) => {
    if (!period || period.status !== "live") return;
    void save(async () =>
      setSnapshot(
        await dataStore.setMastery(
          snapshot.classRoom.id,
          student.id,
          selectedSkillId,
          update,
          new Date().toISOString(),
          activePeriod?.id,
        ),
      ),
    );
  };
  const handleSkillTap = (student: Student) => {
    if (!skillId) return setSkillStudentId(student.id);
    if (snapshot.skills.some((skill) => skill.parentSkillId === skillId)) return setSkillStudentId(student.id);
    if (bulkMode) {
      setBulkSelectedIds((current) => {
        const next = new Set(current);
        next.has(student.id) ? next.delete(student.id) : next.add(student.id);
        return next;
      });
      return;
    }
    if (rapid.status === "active") {
      const previous = masteryFor(student.id, skillId);
      setAssessment(student, skillId, { achievement: rapid.target });
      dispatchRapid({ type: "apply", studentId: student.id, previousAchievement: previous.achievement, previousRequiresSupport: previous.requiresSupport });
      return;
    }
    if (assessmentStudentId === student.id && assessmentSkillId === skillId) {
      setAssessmentStudentId("");
      setAssessmentSkillId("");
      return;
    }
    setAssessmentStudentId(student.id);
    setAssessmentSkillId(skillId);
  };
  const beginBulkAssignment = () => {
    setAssessmentStudentId("");
    setAssessmentSkillId("");
    dispatchRapid({ type: "exit" });
    setBulkMode(true);
    setBulkSelectedIds(new Set());
    setBulkNote("");
    setLastBulkAssignment(undefined);
  };
  const applyBulkAssignment = () => {
    if (!skillId || !bulkSelectedIds.size) return;
    const selectedStudents = activeStudents.filter((student) => bulkSelectedIds.has(student.id));
    const names = selectedStudents.map((student) => student.displayName);
    const learnerSummary = names.length <= 3 ? names.join(", ") : `${names.slice(0, 2).join(", ")}, and ${names.length - 2} others`;
    if (!confirm(`Set ${selectedSkill?.label} to ${achievementDisplay(bulkTarget).label} for ${learnerSummary}?${bulkNote.trim() ? " The shared note will be added to every learner." : ""} Support will not change.`)) return;
    const learners = selectedStudents.map((student) => {
      const current = masteryFor(student.id, skillId);
      setAssessment(student, skillId, { achievement: bulkTarget, note: bulkNote.trim() || undefined });
      return { studentId: student.id, achievement: current.achievement, requiresSupport: current.requiresSupport };
    });
    setLastBulkAssignment({ skillId, learners });
    setBulkSelectedIds(new Set());
    setBulkMode(false);
    setBulkNote("");
  };
  const undoBulkAssignment = () => {
    if (!lastBulkAssignment) return;
    for (const learner of lastBulkAssignment.learners) {
      const student = activeStudents.find((item) => item.id === learner.studentId);
      if (student) setAssessment(student, lastBulkAssignment.skillId, { achievement: learner.achievement, requiresSupport: learner.requiresSupport });
    }
    setLastBulkAssignment(undefined);
  };
  const toggleMap = () => {
    const next = !mapMode;
    setMapMode(next);
    if (next) {
      setFitMap(true);
    }
    void save(async () =>
      setSnapshot(
        await dataStore.mutate(
          snapshot.classRoom.id,
          `/classes/${snapshot.classRoom.id}/settings`,
          "PUT",
          { layout: next ? "map" : "grid" },
        ),
      ),
    );
  };
  const setMapZoom = (next: number) => {
    const scale = Math.min(1.5, Math.max(0.05, next));
    setFitMap(false);
    setMapScale(scale);
    saveSeatingView(snapshot.classRoom.id, mapOrientation, { fit: false, scale });
  };
  const fitAllSeats = () => {
    setFitMap(true);
    saveSeatingView(snapshot.classRoom.id, mapOrientation, { fit: true, scale: effectiveScale });
  };
  const setArrangeMode = (next: boolean) => {
    setArranging(next);
    setActionStudentId("");
    setAttendanceMode(false);
    setMoreOpen(false);
    if (next) {
      setMapScale(effectiveScale);
      setFitMap(false);
    } else {
      fitAllSeats();
    }
  };
  const toggleMapFullscreen = () => {
    const next = !mapFullscreen;
    setMapFullscreen(next);
    if (next) void workspaceRef.current?.requestFullscreen?.().catch(() => undefined);
    else if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  };
  const startSeatMove = (student: Student, clientX: number, clientY: number) => {
    const viewport = mapViewportRef.current?.getBoundingClientRect();
    if (!viewport) return;
    const point = screenToSeat(clientX, clientY, viewport.left, viewport.top, mapTransform);
    const index = activeStudents.findIndex((item) => item.id === student.id);
    const position = mapPositions[index];
    dragOffsetRef.current = { x: point.x - position.x, y: point.y - position.y };
  };
  const seatPosition = (student: Student, clientX: number, clientY: number) => {
    const viewport = mapViewportRef.current?.getBoundingClientRect();
    if (!viewport) return;
    const point = screenToSeat(clientX, clientY, viewport.left, viewport.top, mapTransform);
    const position = clampSeat(
      { x: point.x - dragOffsetRef.current.x, y: point.y - dragOffsetRef.current.y },
      logicalBounds,
    );
    const { x, y } = position;
    setSnapshot({
      ...snapshot,
      students: snapshot.students.map((item) =>
        item.id === student.id ? { ...item, x, y } : item,
      ),
    });
    return position;
  };
  const saveSeat = (student: Student, clientX: number, clientY: number) => {
    const position = seatPosition(student, clientX, clientY);
    if (!position) return;
    void save(async () => {
      await dataStore.mutate(
        snapshot.classRoom.id,
        `/classes/${snapshot.classRoom.id}/students/${student.id}`,
        "PATCH",
        position,
      );
    });
  };
  const finishClassDay = async (confirmAttendanceIncomplete = false) => {
    if (!period) return;
    try {
      setSnapshot(await dataStore.finishPeriod(snapshot.classRoom.id, period.id, confirmAttendanceIncomplete));
      setFinishAttendanceWarning(false);
    } catch (error) {
      if (error instanceof RequestError && error.code === "ATTENDANCE_INCOMPLETE") setFinishAttendanceWarning(true);
      else setError(error instanceof Error ? error.message : "The class day could not be finished.");
    }
  };
  const reopenClassDay = async () => {
    if (!period) return;
    await dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/periods/${period.id}/reopen`, "POST");
    await dataStore.sync();
    setSnapshot(await dataStore.getSnapshot(snapshot.classRoom.id, true));
    setViewPeriodId(period.id);
    setReopenWarning(false);
  };

  return (
    <div ref={workspaceRef} className={`live-workspace ${wholeClassMode ? "whole-class" : ""} ${wholeClassMode && activeStudents.length <= 35 ? "whole-class-fits" : ""} ${lens === "participation" ? "participation-workspace" : ""} ${mapMode ? "map-is-active" : ""} ${mapFullscreen ? "map-is-fullscreen" : ""}`}>
      {needsNewDay && (
        <NewDayPrompt
          previous={activePeriod!}
          onStart={async (details) => {
            await dataStore.mutate(
              snapshot.classRoom.id,
              `/classes/${snapshot.classRoom.id}/periods`,
              "POST",
              details,
            );
            await dataStore.sync();
            setSnapshot(
              await dataStore.getSnapshot(snapshot.classRoom.id, true),
            );
            setViewPeriodId("");
          }}
          onReview={() => setViewPeriodId(activePeriod!.id)}
        />
      )}
      <section className="toolbar card">
        {onBack && <button className="secondary back-to-today" onClick={onBack}>Back to Today classes</button>}
        <div className="period-picker">
          <label htmlFor="period-view">Class day</label>
          <select
            id="period-view"
            value={period?.id ?? ""}
            onChange={(event) => {
              setViewPeriodId(event.target.value);
              setAttendanceMode(false);
              setArranging(false);
              setActionStudentId("");
              setLastAction(undefined);
              dispatchRapid({ type: "exit" });
            }}
          >
            <option value="">No class days</option>
            {snapshot.periods.map((item) => (
              <option value={item.id} key={item.id}>
                {item.label}
                 {item.status === "live" ? " · In progress" : item.status === "scheduled" ? " · Scheduled" : " · Closed"}
              </option>
            ))}
          </select>
          <span
            className={`status-dot ${!viewingHistory && period ? "live" : ""}`}
          >
             {period?.status === "live" ? "In progress" : period?.status === "scheduled" ? "Scheduled" : period ? "Closed" : "Paused"}
          </span>
        </div>
        <div className="segmented" aria-label="Tracking lens">
          <button
            className={lens === "participation" ? "active" : ""}
            onClick={() => chooseLens("participation")}
          >
            Participation
          </button>
          <button
            className={lens === "skills" ? "active" : ""}
            onClick={() => chooseLens("skills")}
          >
            Skills
          </button>
        </div>
        {lens === "skills" && (
          <div className="skill-selector-actions"><select className="skill-selector" value={skillId} onChange={(event) => {
            const nextSkillId = event.target.value;
            if (rapid.status === "active" && nextSkillId !== skillId && !confirm("Exit rapid assessment and switch skills?")) return;
            setSkillId(nextSkillId);
          }} aria-label="Skill">
            <option value="">All skills</option>
            {skillCategories.map((category) => (
              <optgroup label={category} key={category}>
                {parentSkills
                  .filter((skill) => (skill.category || "General") === category)
                  .flatMap((skill) => {
                    const children = snapshot.skills.filter((child) => child.parentSkillId === skill.id);
                    return [
                    <option key={skill.id} value={skill.id}>
                      {skill.label}{children.length ? " · full checklist" : ""}
                    </option>,
                    ...children.map((child) => (
                        <option key={child.id} value={child.id}>
                          {skill.label} / {child.label}
                        </option>
                      )),
                    ];
                  })}
              </optgroup>
            ))}
          </select><button className={bulkMode ? "active-button" : "secondary"} disabled={!selectedSkill || selectedIsParent || viewingHistory} onClick={() => bulkMode ? (setBulkMode(false), setBulkSelectedIds(new Set())) : beginBulkAssignment()}>{bulkMode ? "Cancel rapid assign" : "Rapid assign"}</button></div>
        )}
        <div className={`toolbar-actions ${moreOpen ? "is-open" : ""}`}>
          {viewingHistory ? (
            <button
              className="primary"
              onClick={() => setViewPeriodId(activePeriod?.id ?? "")}
            >
              Return to live
            </button>
          ) : (
            <>
              <button
                className={attendanceMode ? "active-button" : "secondary"}
                onClick={() => {
                  setAttendanceMode(!attendanceMode);
                  setArranging(false);
                  setActionStudentId("");
                  setMoreOpen(false);
                }}
              >
                Attendance
              </button>
              <button
                className="secondary"
                onClick={() => {
                  toggleMap();
                  setMoreOpen(false);
                }}
              >
                {mapMode ? "Auto grid" : "Seating chart"}
              </button>
              {mapMode && (
                <button
                  className={arranging ? "active-button" : "secondary"}
                  onClick={() => {
                    setArrangeMode(!arranging);
                  }}
                >
                  {arranging ? "Done arranging" : "Arrange seats"}
                </button>
              )}
              <PeriodButton />
            </>
          )}
        </div>
        {!viewingHistory && (
          <button
            className="more-button secondary"
            onClick={() => setMoreOpen(!moreOpen)}
            aria-expanded={moreOpen}
          >
            More
          </button>
        )}
      </section>
       {period && <section className={`class-day-controls ${period.status === "live" ? "live" : "closed"}`}><div><strong>{period.status === "live" ? "Class day is in progress" : period.status === "scheduled" ? "Class day is scheduled" : "Class day is closed"}</strong><span>{period.status === "live" ? "Attendance, participation, and skill evidence can be recorded." : period.status === "closed" ? "Participation actions can be corrected in Insights. Reopen only to change attendance or add skill evidence." : "Start this class day when teaching begins."}</span></div><div className="button-row"><button className="secondary" onClick={() => setEditingPeriod(true)}>Edit details</button>{period.status === "live" ? <button className="secondary" onClick={() => void finishClassDay()}>Finish class day</button> : period.status === "scheduled" ? <button className="primary" onClick={() => save(async () => { await dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/periods/${period.id}/start`, "POST"); await dataStore.sync(); setSnapshot(await dataStore.getSnapshot(snapshot.classRoom.id, true)); setViewPeriodId(period.id); setAttendanceMode(true); })}>Start class day</button> : <button className="primary" onClick={() => activePeriod && activePeriod.id !== period.id ? setReopenWarning(true) : void save(reopenClassDay)}>Reopen for editing</button>}</div></section>}
      {snapshot.groups.length > 0 && <details className="group-glance"><summary>Groups <span>{snapshot.groupAssignments.length}/{activeStudents.length} assigned</span></summary><div>{snapshot.groups.map((group) => { const names = activeStudents.filter((student) => snapshot.groupAssignments.some((assignment) => assignment.groupId === group.id && assignment.studentId === student.id)).map((student) => student.displayName); return <section key={group.id}><strong><i style={{ background: group.color }} />{group.label}</strong><span>{names.length ? names.join(", ") : "No learners yet"}</span></section>; })}</div></details>}
      {finishAttendanceWarning && <ConfirmDialog title="Finish without completing attendance?" confirmLabel="Finish anyway" onClose={() => setFinishAttendanceWarning(false)} onConfirm={() => finishClassDay(true)}><p>Attendance has not been marked complete. You can finish anyway, but check the attendance record first if it may be incomplete.</p></ConfirmDialog>}
      {reopenWarning && <ConfirmDialog title="Close the current live class day?" confirmLabel="Close current day and reopen" onClose={() => setReopenWarning(false)} onConfirm={reopenClassDay}><p>Reopening {period?.label} will close {activePeriod?.label}, the class day currently in progress.</p></ConfirmDialog>}
      {lens === "skills" && selectedSkill && (
        <section className="skill-context">
          <strong>
            {selectedSkill.parentSkillId ? "Subskill" : selectedIsParent ? "Skill family" : "Skill"}:{" "}
            {selectedSkill.label}
          </strong>
          <span>
            {selectedSkill.parentSkillId
               ? `Parent: ${selectedParent?.label}. Open a learner's selector or use deliberate rapid assessment.`
               : selectedIsParent
                 ? "Derived from its subskills. Tap a learner to open the full checklist."
                 : "Tap a learner's evidence area to choose an achievement or support flag."}
           </span>
         </section>
       )}
       {lens === "skills" && selectedSkill && !selectedIsParent && !viewingHistory && !bulkMode && (
        <section className={`rapid-controls ${rapid.status === "active" ? "is-active" : ""}`} aria-label="Rapid assessment">
          {rapid.status === "active" ? (
            <>
              <strong>RAPID ASSESSMENT ACTIVE</strong>
              <span>Tap a learner to apply {achievementDisplay(rapid.target).symbol} {achievementDisplay(rapid.target).label}. Support is unchanged.</span>
              <button className="secondary" disabled={!rapid.last} onClick={() => {
                if (!rapid.last) return;
                const student = snapshot.students.find((item) => item.id === rapid.last!.studentId);
                if (student) setAssessment(student, skillId, { achievement: rapid.last.previousAchievement, requiresSupport: rapid.last.previousRequiresSupport });
                dispatchRapid({ type: "undo" });
              }}>Undo</button>
              <button className="primary" onClick={() => dispatchRapid({ type: "exit" })}>Exit rapid mode</button>
            </>
          ) : (
            <>
              <label>Rapid target<select value={rapid.target} onChange={(event) => dispatchRapid({ type: "choose-target", target: event.target.value as Achievement })}>{achievementOptions.map((option) => <option value={option.value} key={option.value}>{option.symbol} {option.label}</option>)}</select></label>
              <button className="primary" onClick={() => dispatchRapid({ type: "start" })}>Start rapid assessment</button>
              <span>Two steps prevent accidental class-wide marks. Support stays individual.</span>
            </>
          )}
        </section>
       )}
       {lens === "skills" && selectedSkill && !selectedIsParent && bulkMode && <section className="bulk-assign-controls" aria-label="Rapid assign selected learners"><div><strong>Assigning {selectedSkill.label}</strong><span>{bulkSelectedIds.size ? `${bulkSelectedIds.size} learner${bulkSelectedIds.size === 1 ? "" : "s"} selected` : "Tap learners to select them"}</span></div><label>Level<select value={bulkTarget} onChange={(event) => setBulkTarget(event.target.value as Achievement)}>{achievementOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><label className="bulk-note">Shared note<textarea value={bulkNote} onChange={(event) => setBulkNote(event.target.value)} maxLength={500} rows={2} placeholder="Optional note for every selected learner" /></label><button className="primary" disabled={!bulkSelectedIds.size} onClick={applyBulkAssignment}>Assign {achievementDisplay(bulkTarget).label}</button></section>}
       {lastBulkAssignment && <section className="bulk-assignment-result" role="status"><span>{achievementDisplay(bulkTarget).label} assigned to {lastBulkAssignment.learners.length} learner{lastBulkAssignment.learners.length === 1 ? "" : "s"}. Support was unchanged.</span><button className="secondary" onClick={undoBulkAssignment}>Undo</button></section>}
      {attendanceMode && (
        <AttendancePanel
          present={presentCount}
          absent={absentCount}
          total={activeStudents.length}
           onMarkAll={async (status) => {
             if (!period) return;
             setSnapshot(await dataStore.setPeriodAttendance(snapshot.classRoom.id, period.id, status));
           }}
           completed={Boolean(period?.attendanceCompletedAt)}
           onFinish={async () => {
              if (period && !period.attendanceCompletedAt) setSnapshot(await dataStore.completeAttendance(snapshot.classRoom.id, period.id));
              setAttendanceMode(false);
            }}
           onSkip={() => setAttendanceMode(false)}
        />
      )}
      {lens === "participation" && !attendanceMode && !arranging ? (
        <ParticipationBar
          students={activeStudents}
          insights={insights}
          periodEvents={
            period
              ? snapshot.events.filter((event) => event.periodId === period.id)
              : []
          }
          attendance={attendance}
          focusOrder={focusOrder}
          mapMode={mapMode}
          onFocusOrder={() => setFocusOrder(!focusOrder)}
          lastAction={lastAction}
          onUndo={async () => {
            if (!lastAction) return;
            await dataStore.sync();
            await dataStore.mutate(
              snapshot.classRoom.id,
              `/classes/${snapshot.classRoom.id}/events/last/${lastAction.studentId}`,
              "DELETE",
            );
            await dataStore.sync();
            setSnapshot(
              await dataStore.getSnapshot(snapshot.classRoom.id, true),
            );
            setLastAction(undefined);
          }}
        />
      ) : (
        <p className="gesture-hint">
          {arranging
            ? "Drag each learner to their real seat. Gaps, pods, rows, and unusual room layouts are all supported and saved for this class."
            : attendanceMode
              ? "Everyone starts present. Tap a tile or its status to mark an absence; tap again to correct it."
               : skillId
                 ? selectedIsParent
                   ? "Tap a learner to open every skill and subskill in the full checklist."
                   : rapid.status === "active"
                     ? `Rapid mode applies ${achievementDisplay(rapid.target).symbol} ${achievementDisplay(rapid.target).label}.`
                     : "Tap a learner's evidence area to choose an explicit achievement."
                 : "Tap a learner to open their full skill checklist."}
        </p>
      )}
      <section className="roster-tools" aria-label="Roster navigation" ref={rosterStartRef} tabIndex={-1}>
        <strong>{mapMode ? activeStudents.length : visibleStudents.length}/{activeStudents.length} learners</strong>
        {activeStudents.length > 12 && (
          <label className="roster-search">
            <span className="sr-only">Find and jump to learner</span>
            <input
              type="search"
              value={rosterQuery}
              list="roster-student-names"
              onChange={(event) => findStudent(event.target.value)}
              placeholder="Find learner"
            />
            <datalist id="roster-student-names">
              {activeStudents.map((student) => <option value={student.displayName} key={student.id} />)}
            </datalist>
          </label>
        )}
        {!mapMode && lens === "participation" && (
          <label className="roster-filter">
            <span className="sr-only">Filter learner status</span>
            <select
              value={rosterFilter}
              onChange={(event) => setRosterFilter(event.target.value as RosterFilter)}
            >
              <option value="all">All learners</option>
              <option value="not-heard">○ Not heard</option>
              <option value="check-in">◆ Check in</option>
            </select>
          </label>
        )}
        {!mapMode && (
          <><button type="button" className={`whole-class-toggle ${wholeClassMode ? "active-button" : "secondary"}`} aria-pressed={wholeClassMode} onClick={() => { const next = wholeClassMode ? "compact" : "overview"; setDensity(next); localStorage.setItem(`roster-density:${snapshot.classRoom.id}`, next); }}>Whole class</button><fieldset className="density-control" aria-label="Student card size"><legend className="sr-only">Student card size</legend><button type="button" aria-label="Show smaller student cards" disabled={density === "overview"} onClick={() => { const next = changeRosterDensity(density, -1); setDensity(next); localStorage.setItem(`roster-density:${snapshot.classRoom.id}`, next); }}>−</button><span aria-live="polite"><small>Card size</small><strong>{rosterDensityLabel(density)}</strong></span><button type="button" aria-label="Show larger student cards" disabled={density === "comfortable"} onClick={() => { const next = changeRosterDensity(density, 1); setDensity(next); localStorage.setItem(`roster-density:${snapshot.classRoom.id}`, next); }}>+</button></fieldset></>
        )}
        {activeStudents.length > 12 && (
          <nav className="roster-index" aria-label="Jump to learner by first letter">
            {initials.map((initial) => <button type="button" onClick={() => jumpToInitial(initial)} key={initial}>{initial}</button>)}
          </nav>
        )}
      </section>
      {!activeStudents.length ? (
        <Empty
          title="Your room is ready"
          text="Add your roster in Classes, then learners will appear here."
        />
      ) : (
        <StudentGrid
          students={visibleStudents}
          layout={mapMode ? "map" : "grid"}
          density={density}
          viewportRef={mapViewportRef}
          canvasRef={mapCanvasRef}
          canvasStyle={mapMode ? {
            width: roomWidth,
            height: roomHeight,
            transform: `translate3d(${mapTransform.translateX}px, ${mapTransform.translateY}px, 0) scale(${effectiveScale})`,
          } : undefined}
          stageStyle={mapMode ? {
            width: "100%",
            height: "100%",
          } : undefined}
          mapControls={mapMode ? (
            <div className="map-controls" aria-label="Seating chart view controls">
              <button type="button" aria-label="Zoom out" onClick={() => setMapZoom(effectiveScale - 0.1)}>−</button>
              <strong aria-live="polite">{Math.round(effectiveScale * 100)}%</strong>
              <button type="button" aria-label="Zoom in" onClick={() => setMapZoom(effectiveScale + 0.1)}>+</button>
              <button type="button" onClick={fitAllSeats}>Fit</button>
              <button type="button" className={arranging ? "active" : ""} onClick={() => setArrangeMode(!arranging)}>{arranging ? "Done" : "Arrange"}</button>
              <button type="button" onClick={toggleMapFullscreen}>{mapFullscreen ? "Exit full screen" : "Full screen"}</button>
            </div>
          ) : undefined}
        >
          {(student, index) => {
            const mastery = skillId ? masteryFor(student.id, skillId) : undefined;
            const summary = skillId && selectedIsParent ? parentSummary(snapshot.skills, snapshot.mastery, student.id, skillId) : undefined;
            const request = requestsByStudent.get(student.id);
            const requestLabel = request
              ? requestTypesById.get(request.requestTypeId)?.label
              : undefined;
            const participationMode =
              lens === "participation" && !attendanceMode && !arranging;
            const cardActionsVisible = !mapMode || effectiveScale >= 0.3;
            return (
              <div
                className={`${mapMode ? "seat-position" : "grid-position"} ${highlightedStudentId === student.id ? "student-jump-highlight" : ""}`}
                key={student.id}
                data-student-id={student.id}
                tabIndex={-1}
                style={
                  mapMode
                    ? ({
                        position: "absolute",
                        left: mapPositions[index].x,
                        top: mapPositions[index].y,
                      } as CSSProperties)
                    : undefined
                }
              >
                <StudentTile
                  student={student}
                  selected={(lens === "skills" && rapid.status === "active" && Boolean(skillId)) || bulkSelectedIds.has(student.id) || actionStudentId === student.id}
                  attendance={attendance(student.id)}
                  positives={
                    participationMode ? positives(student.id) : undefined
                  }
                  negatives={
                    participationMode ? negatives(student.id) : undefined
                  }
                  detail={
                    arranging
                      ? "Drag to seat"
                      : mapMode
                        ? undefined
                      : lens === "skills" && !attendanceMode
                         ? skillId
                           ? summary
                             ? parentSummaryText(summary)
                             : `${achievementDisplay(mastery!.achievement).symbol} ${achievementDisplay(mastery!.achievement).label}${mastery!.requiresSupport ? " · ◆ Support" : ""}`
                           : `Meet/exceed ${masteryProgress(student.id)}/${assessedSkills.length}`
                        : undefined
                  }
                  requestLabel={requestLabel}
                  attendancePass={attendanceMode}
                  arranging={arranging}
                  participation={participationMode && !viewingHistory}
                  seatingScale={mapMode ? effectiveScale : undefined}
                  showCardActions={cardActionsVisible}
                  notLogged={
                    !viewingHistory &&
                    participationMode &&
                    positives(student.id) === 0 &&
                    attendance(student.id) === "present"
                  }
                  feedback={
                    feedback?.studentId === student.id
                      ? feedback.type
                      : undefined
                  }
                  onAttendance={() => updateAttendance(student)}
                  onTap={() =>
                    viewingHistory
                      ? undefined
                      : arranging
                        ? undefined
                        : attendanceMode
                          ? updateAttendance(student)
                          : lens === "skills"
                            ? handleSkillTap(student)
                            : mapMode && !cardActionsVisible
                              ? setActionStudentId(student.id)
                              : undefined
                  }
                  onPositive={() => participate(student, 1)}
                  onNegative={() => participate(student, -1)}
                  onMove={
                    mapMode && arranging
                      ? (x, y) => seatPosition(student, x, y)
                      : undefined
                  }
                  onMoveStart={
                    mapMode && arranging
                      ? (x, y) => startSeatMove(student, x, y)
                      : undefined
                  }
                  onMoveEnd={
                    mapMode && arranging
                      ? (x, y) => saveSeat(student, x, y)
                      : undefined
                  }
                />
              </div>
            );
          }}
        </StudentGrid>
      )}
      {lens === "skills" && assessmentSkillId && assessmentStudentId && rapid.status !== "active" && !bulkMode && (() => {
        const student = activeStudents.find((item) => item.id === assessmentStudentId);
        if (!student) return null;
        const skill = snapshot.skills.find((item) => item.id === assessmentSkillId);
        if (!skill) return null;
        const mastery = masteryFor(student.id, assessmentSkillId);
        return <section className="individual-assessment-rail" aria-label={`Assess ${student.displayName}`}><div className="individual-assessment-heading"><strong>Scoring {skill.label} for {student.displayName}</strong><button className="text-button" onClick={() => { setAssessmentStudentId(""); setAssessmentSkillId(""); }}>Close</button></div><AchievementSelector achievement={mastery.achievement} requiresSupport={mastery.requiresSupport} onAchievement={(achievement) => setAssessment(student, assessmentSkillId, { achievement })} onSupport={(requiresSupport) => setAssessment(student, assessmentSkillId, { requiresSupport })} onNote={(note) => setAssessment(student, assessmentSkillId, { note })} /></section>;
      })()}
      {mapMode && !arranging && lens === "participation" && effectiveScale < 0.3 && actionStudentId && (() => {
        const student = activeStudents.find((item) => item.id === actionStudentId);
        if (!student) return null;
        return <section className="seating-action-tray" role="dialog" aria-label={`Participation actions for ${student.displayName}`}>
          <div className="tray-student"><strong>{student.displayName}</strong><span className={attendance(student.id) === "absent" ? "absent" : "present"}>{attendance(student.id) === "absent" ? "A" : "P"}<span className="sr-only"> {attendance(student.id)}</span></span></div>
          <button type="button" className="positive-action" disabled={attendance(student.id) === "absent"} onClick={() => participate(student, 1)}><span><b>+</b> Positive Action</span><small>{positives(student.id)} today</small></button>
          <button type="button" className="redirect-action" disabled={attendance(student.id) === "absent"} onClick={() => participate(student, -1)}><span><b>−</b> Redirect</span><small>{negatives(student.id)} today</small></button>
          <button type="button" className="secondary" onClick={() => setActionStudentId("")}>Close</button>
        </section>;
      })()}
      {showBackToTop && (
        <button className="back-to-top" type="button" onClick={() => {
          rosterStartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          rosterStartRef.current?.focus({ preventScroll: true });
        }}>Back to roster top</button>
      )}
      <RequestRail />
      {skillStudentId && (
        focusedChecklistEnabled ? <ChecklistScreen
          student={snapshot.students.find(
            (item) => item.id === skillStudentId,
          )!}
          onClose={() => setSkillStudentId("")}
          masteryFor={(id) => masteryFor(skillStudentId, id)}
          onAssess={(id, update) => setAssessment(snapshot.students.find((item) => item.id === skillStudentId)!, id, update)}
        /> : <LegacySkillChecklist
          student={snapshot.students.find(
            (item) => item.id === skillStudentId,
          )!}
          onClose={() => setSkillStudentId("")}
          masteryFor={(id) => masteryFor(skillStudentId, id)}
          onAssess={(id, update) => setAssessment(snapshot.students.find((item) => item.id === skillStudentId)!, id, update)}
        />
      )}
      {editingPeriod && period && <ClassDayDialog period={period} onClose={() => setEditingPeriod(false)} onSave={async (body) => { await dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/periods/${period.id}`, "PATCH", body); await dataStore.sync(); setSnapshot(await dataStore.getSnapshot(snapshot.classRoom.id, true)); setEditingPeriod(false); }}/>} 
    </div>
  );

  function undoLast(student: Student) {
    const last = [...periodEvents(student.id)]
      .reverse()
      .find((event) => event.type === "part+" || event.type === "part-");
    if (last)
      void save(async () => {
        await dataStore.sync();
        await dataStore.mutate(
          snapshot!.classRoom.id,
          `/classes/${snapshot!.classRoom.id}/events/last/${student.id}`,
          "DELETE",
        );
        await dataStore.sync();
        setSnapshot(await dataStore.getSnapshot(snapshot!.classRoom.id, true));
      });
  }
}

function AttendancePanel({
  present,
  absent,
  total,
  onMarkAll,
  completed,
  onFinish,
  onSkip,
}: {
  present: number;
  absent: number;
  total: number;
  onMarkAll: (status: "present" | "absent") => Promise<void>;
  completed: boolean;
  onFinish: () => Promise<void>;
  onSkip: () => void;
}) {
  return (
    <section className="attendance-panel card">
      <div>
        <p className="eyebrow">ATTENDANCE PASS</p>
        <h2>
          {present} present{" "}
          <span>
            · {absent} absent · {total} enrolled
          </span>
        </h2>
        <p>
          Everyone starts present. Tap only the learners who are absent.
          Attendance stays teacher-controlled and updates this same list.
        </p>
      </div>
      <div className="button-row">
        <button className="secondary" onClick={() => onMarkAll("present")}>
          Reset all
        </button>
         {!completed && <button className="text-button" onClick={onSkip}>Skip for now</button>}
         <button className="primary" onClick={() => void onFinish()}>
           {completed ? "Done" : "Finish attendance"}
        </button>
      </div>
    </section>
  );
}

function ClassDayDialog({ period, onClose, onSave }: { period: import("../types").Period; onClose: () => void; onSave: (body: Record<string, unknown>) => Promise<void> }) {
  const [label, setLabel] = useState(period.label); const [type, setType] = useState<PeriodType>(period.type ?? "instructional"); const [teacherNote, setTeacherNote] = useState(period.teacherNote ?? ""); const [busy, setBusy] = useState(false);
  return <div className="modal-backdrop"><form className="card modal" onSubmit={async (event) => { event.preventDefault(); setBusy(true); await onSave({ label, type, participationExpected: type === "instructional", teacherNote: teacherNote || undefined }); setBusy(false); }}><h2>Edit class day</h2><label>Class-day label<input value={label} onChange={(event) => setLabel(event.target.value)}/></label><label>Activity type<select value={type} onChange={(event) => setType(event.target.value as PeriodType)}><option value="instructional">Instructional</option><option value="independent">Independent work</option><option value="assessment">Assessment</option><option value="no-participation">No participation expected</option></select></label><label>Teacher note<textarea value={teacherNote} onChange={(event) => setTeacherNote(event.target.value)} rows={3} placeholder="Optional class-day context"/></label><div className="button-row"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !label.trim()}>{busy ? "Saving..." : "Save class day"}</button></div></form></div>;
}

function ConfirmDialog({ title, confirmLabel, onClose, onConfirm, children }: { title: string; confirmLabel: string; onClose: () => void; onConfirm: () => Promise<void>; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  return <div className="modal-backdrop"><section className="card modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="live-confirm-title"><h2 id="live-confirm-title">{title}</h2>{children}<div className="button-row"><button className="secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="danger-button" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>{busy ? "Saving..." : confirmLabel}</button></div></section></div>;
}

function NewDayPrompt({
  previous,
  onStart,
  onReview,
}: {
  previous: NonNullable<
    ReturnType<typeof useApp.getState>["snapshot"]
  >["periods"][number];
  onStart: (details: Record<string, unknown>) => Promise<void>;
  onReview: () => void;
}) {
  const [type, setType] = useState("instructional");
  const [busy, setBusy] = useState(false);
  const expected = type === "instructional";
  return (
    <section className="new-day-overlay">
      <div className="card new-day-dialog">
        <p className="eyebrow">A NEW SCHOOL DAY</p>
        <h2>Start today's class?</h2>
        <p>
          The active class day is <strong>{previous.label}</strong>. Starting
          today archives that class day while preserving attendance,
          participation, skills, and seat locations.
        </p>
        <label>
          Today's activity
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="instructional">
              Instructional · participation expected
            </option>
            <option value="independent">Independent work</option>
            <option value="assessment">Assessment</option>
            <option value="no-participation">No participation expected</option>
          </select>
        </label>
        <div className="button-row">
          <button className="secondary" onClick={onReview}>
            Review previous day
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onStart({
                label: new Date().toLocaleDateString(),
                type,
                participationExpected: expected,
              });
              setBusy(false);
            }}
          >
            {busy ? "Starting..." : "Start today's class"}
          </button>
        </div>
      </div>
    </section>
  );
}

function ParticipationBar({
  students,
  insights,
  periodEvents,
  attendance,
  focusOrder,
  mapMode,
  onFocusOrder,
  lastAction,
  onUndo,
}: {
  students: Student[];
  insights: ReturnType<typeof participationInsights>;
  periodEvents: { studentId: string; type: string }[];
  attendance: (studentId: string) => "present" | "absent";
  focusOrder: boolean;
  mapMode: boolean;
  onFocusOrder: () => void;
  lastAction?: { studentId: string; type: "part+" | "part-" };
  onUndo: () => Promise<void>;
}) {
  const present = students.filter(
    (student) => attendance(student.id) === "present",
  );
  const heard = present.filter((student) =>
    periodEvents.some(
      (event) =>
        event.studentId === student.id &&
        event.type === "part+",
    ),
  );
  const positive = periodEvents.filter(
    (event) => event.type === "part+",
  ).length;
  const redirect = periodEvents.filter(
    (event) => event.type === "part-",
  ).length;
  const lastStudent = students.find(
    (student) => student.id === lastAction?.studentId,
  );
  const needsAttention = insights.filter(
    (item) => item.status === "needs-attention",
  ).length;
  const regular = insights.filter((item) => item.status === "regular").length;
  return (
    <section className="participation-bar card">
      <div className="coverage">
        <span
          className="coverage-ring"
          style={
            {
              "--coverage": `${present.length ? Math.round((heard.length / present.length) * 100) : 0}%`,
            } as CSSProperties
          }
        >
          <b>{heard.length}</b>
          <small>of {present.length}</small>
        </span>
        <div>
          <p className="eyebrow">PARTICIPATION GUIDANCE</p>
          <h2>
            {present.length - heard.length
              ? `${present.length - heard.length} still to hear from today`
              : "Everyone has a Positive Action today"}
          </h2>
          <p className="history-summary">
            <b>{needsAttention}</b> need a check-in over time · <b>{regular}</b>{" "}
            participating regularly
          </p>
        </div>
      </div>
      <div className="session-totals">
        <span>
          <b>{positive}</b> Positive Action
        </span>
        <span>
          <b>{redirect}</b> redirect
        </span>
      </div>
      {!mapMode && (
        <button
          className={
            focusOrder ? "active-button focus-order" : "secondary focus-order"
          }
          onClick={onFocusOrder}
        >
          {focusOrder ? "Show class order" : "Needs attention first"}
        </button>
      )}
      {lastAction && (
        <button className="undo-action" onClick={onUndo}>
          <span>Undo last</span>
          <strong>
            {lastAction.type === "part+" ? "+" : "−"} {lastStudent?.displayName}
          </strong>
        </button>
      )}
    </section>
  );
}

const focusedChecklistEnabled = import.meta.env.VITE_FOCUSED_CHECKLIST !== "false";

type ChecklistScore = { level: Achievement; support: boolean; photoCount: number };

function ChecklistScreen({
  student,
  onClose,
  masteryFor,
  onAssess,
}: {
  student: Student;
  onClose: () => void;
  masteryFor: (id: string) => { achievement: Achievement; requiresSupport: boolean };
  onAssess: (id: string, update: { achievement?: Achievement; requiresSupport?: boolean }) => void;
}) {
  const { snapshot } = useApp();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<import("../types").SkillPhoto[]>([]);
  const [railHeight, setRailHeight] = useState(0);
  const [message, setMessage] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [uploading, setUploading] = useState(false);
  const openedAt = useRef(Date.now());
  const scoredAtOpen = useRef(0);
  const listRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const photoInputRef = useRef<HTMLInputElement>(null);
  const activePeriod = snapshot?.periods.find((period) => period.status === "live");

  const items = useMemo(() => snapshot ? assessableSkills(snapshot.skills) : [], [snapshot]);
  const scores = useMemo(() => new Map(items.map((item) => {
    const mastery = masteryFor(item.id);
    return [item.id, { level: mastery.achievement, support: mastery.requiresSupport, photoCount: photos.filter((photo) => photo.skillId === item.id).length } satisfies ChecklistScore];
  })), [items, masteryFor, photos]);
  const assessedCount = [...scores.values()].filter((score) => score.level !== "not_started").length;
  const allScored = items.length > 0 && assessedCount === items.length;
  const focused = items.find((item) => item.id === focusedId) ?? null;

  useEffect(() => {
    if (!snapshot) return;
    void dataStore.getSkillPhotos(snapshot.classRoom.id, student.id).then(setPhotos).catch(() => setPhotoError("Photo evidence could not be loaded."));
  }, [snapshot?.classRoom.id, student.id]);
  useEffect(() => dataStore.subscribeSyncStatus((status) => {
    const failed = status.failed.find((change) => change.path.includes(`/mastery/${student.id}/`));
    if (!failed) return;
    const skillId = failed.path.split("/").at(-1);
    const skill = items.find((item) => item.id === skillId);
    if (skill) setMessage(`Couldn't save ${skill.label}. Retry.`);
  }), [items, student.id]);
  useEffect(() => {
    setFocusedId(items.find((item) => scores.get(item.id)?.level === "not_started")?.id ?? null);
    scoredAtOpen.current = assessedCount;
    openedAt.current = Date.now();
  }, [student.id]);
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const measure = () => setRailHeight(rail.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!focused || event.target instanceof HTMLInputElement) return;
      const index = items.findIndex((item) => item.id === focused.id);
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        focusItem(items[Math.min(items.length - 1, index + 1)]?.id ?? null, false);
      }
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        focusItem(items[Math.max(0, index - 1)]?.id ?? null, false);
      }
      if (["1", "2", "3", "4"].includes(event.key)) {
        event.preventDefault();
        setLevel(achievementOptions[Number(event.key) - 1].value);
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        toggleSupport();
      }
    };
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
  }, [focused, items, scores]);
  if (!snapshot) return null;

  const focusItem = (id: string | null, scroll: boolean) => {
    setFocusedId(id);
    if (!id || !scroll) return;
    requestAnimationFrame(() => {
      const row = rowRefs.current.get(id);
      const list = listRef.current;
      if (!row || !list) return;
      const rowBox = row.getBoundingClientRect();
      const listBox = list.getBoundingClientRect();
      if (rowBox.top >= listBox.top && rowBox.bottom <= listBox.bottom) return;
      row.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  };
  const nextUnscored = (currentId: string) => {
    const index = items.findIndex((item) => item.id === currentId);
    return [...items.slice(index + 1), ...items.slice(0, index)].find((item) => scores.get(item.id)?.level === "not_started")?.id ?? null;
  };
  const setLevel = (level: Achievement) => {
    if (!focused) return;
    const wasUnscored = scoreFor(focused.id).level === "not_started";
    onAssess(focused.id, { achievement: level });
    window.dispatchEvent(new CustomEvent("checklist-score", { detail: { version: "focused-rail", studentId: student.id, skillId: focused.id, level } }));
    setMessage(`${focused.label} set to ${achievementDisplay(level).label}.${allScored || !wasUnscored ? "" : " All skills scored."}`);
    focusItem(focused.id, false);
    if (!allScored && wasUnscored && !nextUnscored(focused.id)) {
      window.dispatchEvent(new CustomEvent("checklist-complete", { detail: { version: "focused-rail", studentId: student.id, scoredSkills: items.length - scoredAtOpen.current, elapsedMs: Date.now() - openedAt.current } }));
    }
  };
  const toggleSupport = () => {
    if (!focused) return;
    onAssess(focused.id, { requiresSupport: !scores.get(focused.id)?.support });
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !focused) return;
    setUploading(true); setPhotoError("");
    try {
      const image = await resizeEvidencePhoto(file);
      const photo = await dataStore.uploadSkillPhoto(snapshot.classRoom.id, student.id, focused.id, image, { filename: file.name, periodId: activePeriod?.id, assessedAt: new Date().toISOString() });
      setPhotos((current) => [photo, ...current]);
    } catch (error) {
      setPhotoError(`Couldn't save ${focused.label}. Retry.`);
    } finally { setUploading(false); }
  };
  const scoreFor = (id: string) => scores.get(id)!;
  return <aside className="drawer focused-checklist" role="dialog" aria-modal="true" aria-label={`${student.displayName} skills`}>
    <header className="focused-checklist-header">
      <button className="drawer-close" onClick={onClose}>Close</button>
      <ProgressHeader student={student} assessed={assessedCount} total={items.length} />
    </header>
    <section className="focused-checklist-list" ref={listRef} style={{ paddingBottom: railHeight + 16 }}>
      {snapshot.skills.filter((skill) => !skill.parentSkillId).map((skill) => {
        const children = snapshot.skills.filter((child) => child.parentSkillId === skill.id);
        if (!children.length) return <SkillRow key={skill.id} skill={skill} score={scoreFor(skill.id)} focused={focusedId === skill.id} onFocus={() => focusItem(skill.id, false)} rowRef={(node) => { if (node) rowRefs.current.set(skill.id, node); }} />;
        const completed = children.filter((child) => scoreFor(child.id).level !== "not_started").length;
        return <section className="focused-skill-family" key={skill.id}><SkillGroupHeader label={skill.label} completed={completed} total={children.length} />{children.map((child) => <SkillRow key={child.id} skill={child} score={scoreFor(child.id)} focused={focusedId === child.id} inset onFocus={() => focusItem(child.id, false)} rowRef={(node) => { if (node) rowRefs.current.set(child.id, node); }} />)}</section>;
      })}
      {!items.length && <p>No skills yet. Add a checklist in Classes.</p>}
    </section>
    <p className="sr-only" aria-live="polite">{message}</p>
    {(photoError) && <p className="focused-checklist-error" role="status">{photoError}</p>}
    <ForwardScoringRail ref={railRef} skill={focused} score={focused ? scoreFor(focused.id) : null} allScored={allScored} uploading={uploading} onLevel={setLevel} onNext={() => focused && focusItem(nextUnscored(focused.id), true)} onSupport={toggleSupport} onPhoto={() => photoInputRef.current?.click()} />
    <input ref={photoInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={upload} />
  </aside>;
}

function ProgressHeader({ student, assessed, total }: { student: Student; assessed: number; total: number }) {
  return <div className="checklist-progress"><div><p className="eyebrow">Skills checklist</p><h2>{student.displayName}</h2><span>{assessed} of {total} assessed</span></div><div className="segmented-progress" aria-label={`${assessed} of ${total} skills assessed`}>{Array.from({ length: total }, (_, index) => <i className={index < assessed ? "complete" : ""} key={index} />)}</div></div>;
}

function SkillGroupHeader({ label, completed, total }: { label: string; completed: number; total: number }) {
  return <header className="focused-group-header"><strong>{label}</strong><span>{completed} of {total}</span></header>;
}

function SkillRow({ skill, score, focused, inset = false, onFocus, rowRef }: { skill: import("../types").Skill; score: ChecklistScore; focused: boolean; inset?: boolean; onFocus: () => void; rowRef: (node: HTMLButtonElement | null) => void }) {
  const label = achievementDisplay(score.level).label;
  return <button ref={rowRef} className={`focused-skill-row ${focused ? "is-focused" : ""} ${inset ? "is-subskill" : ""}`} onClick={onFocus} aria-pressed={focused} aria-label={`${skill.label}, ${label}${score.support ? ", requires support" : ""}`}><strong>{skill.label}</strong><span className="focused-row-state">{score.support && <b className="support-label">◇ Requires support</b>}<b className={`focused-state-chip ${score.level}`}>{label}</b>{score.photoCount > 0 && <em aria-label={`${score.photoCount} photos`}>▣ {score.photoCount}</em>}</span></button>;
}

const ScoringRail = ({ skill, score, allScored, uploading, onLevel, onNext, onSupport, onPhoto }: { skill: import("../types").Skill | null; score: ChecklistScore | null; allScored: boolean; uploading: boolean; onLevel: (level: Achievement) => void; onNext: () => void; onSupport: () => void; onPhoto: () => void }, ref: ForwardedRef<HTMLElement>) => <section className="scoring-rail" ref={ref} aria-label="Scoring controls"><div className="scoring-rail-heading"><strong>{skill ? `Scoring ${skill.label}${allScored ? " · all skills scored" : ""}` : "All skills scored."}</strong><button onClick={onNext} disabled={!skill || allScored}>Next unscored <span aria-hidden="true">→</span></button></div><div className="scoring-levels" role="radiogroup" aria-label={skill ? `Score ${skill.label}` : "No skill selected"}>{achievementOptions.map((option, index) => <button role="radio" aria-checked={score?.level === option.value} disabled={!skill} className={score?.level === option.value ? "selected" : ""} onClick={() => onLevel(option.value)} key={option.value}>{index === 0 ? "None" : option.label}</button>)}</div><div className="scoring-rail-actions"><button className={score?.support ? "support-on" : ""} onClick={onSupport} disabled={!skill}>◇ Requires support</button><button onClick={onPhoto} disabled={!skill || uploading}>{uploading ? "Saving photo..." : "Add photo"}</button></div></section>;
const ForwardScoringRail = forwardRef(ScoringRail);

function LegacySkillChecklist({
  student,
  onClose,
  masteryFor,
  onAssess,
}: {
  student: Student;
  onClose: () => void;
  masteryFor: (id: string) => { achievement: Achievement; requiresSupport: boolean };
  onAssess: (id: string, update: { achievement?: Achievement; requiresSupport?: boolean }) => void;
}) {
  const { snapshot } = useApp();
  const [photos, setPhotos] = useState<import("../types").SkillPhoto[]>([]);
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(() => new Set());
  const [uploadingSkillId, setUploadingSkillId] = useState("");
  const [photoError, setPhotoError] = useState("");
  const activePeriod = snapshot?.periods.find((period) => period.status === "live");
  useEffect(() => {
    if (!snapshot) return;
    void dataStore.getSkillPhotos(snapshot.classRoom.id, student.id).then(setPhotos).catch(() => setPhotoError("Photo evidence could not be loaded."));
  }, [snapshot?.classRoom.id, student.id]);
  if (!snapshot) return null;
  const parents = topLevelSkills(snapshot.skills);
  const upload = async (skillId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setUploadingSkillId(skillId); setPhotoError("");
    try {
      const image = await resizeEvidencePhoto(file);
      const photo = await dataStore.uploadSkillPhoto(snapshot.classRoom.id, student.id, skillId, image, { filename: file.name, periodId: activePeriod?.id, assessedAt: new Date().toISOString() });
      setPhotos((current) => [photo, ...current]);
    } catch (error) { setPhotoError(error instanceof Error ? error.message : "The photo could not be saved."); }
    finally { setUploadingSkillId(""); }
  };
  const removePhoto = async (photoId: string) => {
    if (!confirm("Delete this photo evidence? This cannot be undone.")) return;
    await dataStore.deleteSkillPhoto(snapshot.classRoom.id, photoId);
    setPhotos((current) => current.filter((photo) => photo.id !== photoId));
  };
  return (
    <aside
      className="drawer skill-drawer"
      role="dialog"
      aria-modal="true"
      aria-label={`${student.displayName} skills`}
    >
      <button className="drawer-close" onClick={onClose}>
        Close
      </button>
      <div
        className="avatar large"
        style={{ background: student.avatar.color }}
      >
        {student.avatar.emoji}
      </div>
      <p className="eyebrow">FULL CHECKLIST</p>
      <h2>{student.displayName}</h2>
      <p>
        Choose an achievement and support status for every standalone skill or
        subskill. Skill families show counts from their subskills.
      </p>
      <p className="photo-privacy-note"><strong>Teacher evidence only.</strong> You can photograph or upload the student's work for each skill. Students cannot add, view, or remove these photos. Avoid faces, legal names, and other identifying details.</p>
      {photoError && <p className="error" role="alert">{photoError}</p>}
      {parents.length > 1 && <div className="checklist-expand-actions"><button className="secondary" onClick={() => setExpandedSkills(new Set(parents.map((skill) => skill.id)))}>Expand all skills</button><button className="secondary" onClick={() => setExpandedSkills(new Set())}>Collapse all skills</button></div>}
      {parents.map((skill) => {
        const children = snapshot.skills.filter(
          (child) => child.parentSkillId === skill.id,
        );
        const skillMastery = masteryFor(skill.id);
        const summary = children.length ? parentSummary(snapshot.skills, snapshot.mastery, student.id, skill.id) : undefined;
        return (
          <section className="checklist-family" key={skill.id}>
            <button className="checklist-skill checklist-parent" aria-expanded={expandedSkills.has(skill.id)} onClick={() => setExpandedSkills((current) => { const next = new Set(current); next.has(skill.id) ? next.delete(skill.id) : next.add(skill.id); return next; })}>
              <span>
                <strong>{skill.label}</strong>
                <small>
                  {skill.category || "General"}
                  {children.length ? ` · ${children.length} subskills` : ""}
                </small>
              </span>
              <b className="checklist-summary">
                {summary ? parentSummaryText(summary) : `${achievementDisplay(skillMastery.achievement).symbol} ${achievementDisplay(skillMastery.achievement).label}${skillMastery.requiresSupport ? " · ◆ Support" : ""}`}
              </b>
              <i aria-hidden="true">{expandedSkills.has(skill.id) ? "−" : "+"}</i>
            </button>
            {expandedSkills.has(skill.id) && <>{!children.length && <AchievementSelector achievement={skillMastery.achievement} requiresSupport={skillMastery.requiresSupport} onAchievement={(achievement) => onAssess(skill.id, { achievement })} onSupport={(requiresSupport) => onAssess(skill.id, { requiresSupport })}/>} 
            <SkillPhotoControls skillId={skill.id} label={skill.label} photos={photos.filter((photo) => photo.skillId === skill.id)} uploading={uploadingSkillId === skill.id} onUpload={upload} onDelete={removePhoto}/>
            {children.map((child) => {
              const childMastery = masteryFor(child.id);
              return (
                <div className="subskill-evidence" key={child.id}>
                  <div className="checklist-skill subskill"><span><strong>↳ {child.label}</strong><small>Contributes to {skill.label}</small></span><b>{achievementDisplay(childMastery.achievement).symbol} {achievementDisplay(childMastery.achievement).label}{childMastery.requiresSupport ? " · ◆ Support" : ""}</b></div>
                  <AchievementSelector achievement={childMastery.achievement} requiresSupport={childMastery.requiresSupport} onAchievement={(achievement) => onAssess(child.id, { achievement })} onSupport={(requiresSupport) => onAssess(child.id, { requiresSupport })}/>
                  <SkillPhotoControls skillId={child.id} label={child.label} photos={photos.filter((photo) => photo.skillId === child.id)} uploading={uploadingSkillId === child.id} onUpload={upload} onDelete={removePhoto}/>
                </div>
              );
            })}</>}
          </section>
        );
      })}
      {!parents.length && <p>No skills yet. Add a checklist in Classes.</p>}
    </aside>
  );
}

function AchievementSelector({ achievement, requiresSupport, onAchievement, onSupport, onNote }: { achievement: Achievement; requiresSupport: boolean; onAchievement: (achievement: Achievement) => void; onSupport: (requiresSupport: boolean) => void; onNote?: (note: string) => void }) {
  const [selectedAchievement, setSelectedAchievement] = useState(achievement);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => setSelectedAchievement(achievement), [achievement]);
  return (
    <div className="achievement-selector" aria-label="Achievement evidence">
      <div className="achievement-options">
        {achievementOptions.map((option) => (
          <button type="button" key={option.value} className={`achievement-option achievement-${option.value} ${selectedAchievement === option.value ? "selected" : ""}`} aria-pressed={selectedAchievement === option.value} onClick={() => { setSelectedAchievement(option.value); onAchievement(option.value); }}>
            <b aria-hidden="true">{option.symbol}</b><span>{option.label}</span>
          </button>
        ))}
      </div>
      <label className={`support-toggle ${requiresSupport ? "selected" : ""}`}><input type="checkbox" checked={requiresSupport} onChange={(event) => onSupport(event.target.checked)}/><span>◆ Requires support</span></label>
      {onNote && <><button className="assessment-note-toggle" type="button" onClick={() => setNoteOpen((open) => !open)} aria-expanded={noteOpen}>{noteOpen ? "Hide note" : "Add note"}</button>{noteOpen && <label className="assessment-note">Assessment note<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2} placeholder="Optional observation or evidence" /><button type="button" className="secondary" disabled={!note.trim()} onClick={() => { onNote(note.trim()); setNote(""); setNoteOpen(false); }}>Save note</button></label>}</>}
    </div>
  );
}

function SkillPhotoControls({ skillId, label, photos, uploading, onUpload, onDelete }: { skillId: string; label: string; photos: import("../types").SkillPhoto[]; uploading: boolean; onUpload: (skillId: string, event: ChangeEvent<HTMLInputElement>) => void; onDelete: (photoId: string) => void }) {
  const cameraId = `camera-${skillId}`; const uploadId = `upload-${skillId}`;
  return <details className="skill-photo-evidence"><summary><strong>Teacher photo evidence</strong><span>{uploading ? "Saving..." : `${photos.length} photo${photos.length === 1 ? "" : "s"}`}</span></summary><div className="skill-photo-actions"><label className="secondary" htmlFor={cameraId}>Take photo<input id={cameraId} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => onUpload(skillId, event)} disabled={uploading}/></label><label className="secondary" htmlFor={uploadId}>Upload work<input id={uploadId} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onUpload(skillId, event)} disabled={uploading}/></label></div>{photos.length > 0 && <div className="skill-photo-gallery">{photos.map((photo) => <figure key={photo.id}><img src={photo.imageUrl} alt={`${label} work evidence from ${new Date(photo.assessedAt).toLocaleDateString()}`} loading="lazy"/><figcaption><span>{new Date(photo.assessedAt).toLocaleDateString()}</span><button onClick={() => onDelete(photo.id)}>Delete</button></figcaption></figure>)}</div>}</details>;
}

async function resizeEvidencePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a JPEG, PNG, or WebP image.");
  const bitmap = await createImageBitmap(file); const max = 1600; const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .82));
  if (!blob) throw new Error("The photo could not be prepared.");
  if (blob.size > 5 * 1024 * 1024) throw new Error("The photo is too large. Choose a smaller image.");
  return blob;
}

function PeriodButton() {
  const { snapshot, setSnapshot } = useApp();
  if (!snapshot) return null;
  const act = async () => {
    if (
      !confirm(
        "Start a fresh class day? The current class day will remain in history.",
      )
    )
      return;
    await dataStore.mutate(
      snapshot.classRoom.id,
      `/classes/${snapshot.classRoom.id}/periods`,
      "POST",
      { label: new Date().toLocaleDateString() },
    );
    setSnapshot(await dataStore.getSnapshot(snapshot.classRoom.id, true));
  };
  return (
    <button className="primary" onClick={act}>
      + New class day
    </button>
  );
}

function RequestRail() {
  const { snapshot, setSnapshot, setError } = useApp();
  const classId = snapshot?.classRoom.id ?? "";
  const collapsedKey = `request-rail-collapsed:${classId}`;
  const seenKey = `request-rail-seen:${classId}`;
  const [open, setOpen] = useState(() => sessionStorage.getItem(collapsedKey) === "false");
  const [sound, setSound] = useState(() => localStorage.getItem("request-alert-sound") === "true");
  const [seen, setSeen] = useState<Set<string>>(() => new Set(JSON.parse(sessionStorage.getItem(seenKey) ?? "[]") as string[]));
  const [completionOpen, setCompletionOpen] = useState<Record<string, boolean>>({});
  const [pulse, setPulse] = useState(false);
  const [undo, setUndo] = useState<{ id: string; name: string; action: "resolved" | "cleared" }>();
  const previousNewCount = useRef(0);
  const soundPlaying = useRef(false);

  useEffect(() => {
    setOpen(sessionStorage.getItem(`request-rail-collapsed:${classId}`) === "false");
    setSeen(new Set(JSON.parse(sessionStorage.getItem(`request-rail-seen:${classId}`) ?? "[]") as string[]));
    setCompletionOpen({});
    setUndo(undefined);
    previousNewCount.current = 0;
  }, [classId]);

  useEffect(() => dataStore.subscribeRequestUpdates(classId, () => {
    setPulse(true);
    window.setTimeout(() => setPulse(false), 900);
  }), [classId]);

  const prepared = useMemo(() => {
    if (!snapshot) return null;
    const period = snapshot.periods.find((item) => item.status === "live");
    const attendance = new Map(snapshot.attendance.filter((item) => item.periodId === period?.id).map((item) => [item.studentId, item.status]));
    const students = new Map(snapshot.students.map((student) => [student.id, student]));
    const requests = snapshot.requests.filter((request) => (attendance.get(request.studentId) ?? "present") === "present");
    const lanes = groupRequestLanes(snapshot.requestTypes, requests);
    const newIds = unseenRequestIds(requests, seen);
    return { requests, lanes, newIds, students, alert: requestAlert(newIds, lanes) };
  }, [snapshot, seen]);

  const playAlert = () => {
    if (!sound || soundPlaying.current) return;
    const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    soundPlaying.current = true;
    oscillator.frequency.value = 520;
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.16);
    oscillator.onended = () => { soundPlaying.current = false; void context.close(); };
  };

  useEffect(() => {
    const count = prepared?.newIds.size ?? 0;
    if (count > previousNewCount.current) playAlert();
    previousNewCount.current = count;
  }, [prepared?.newIds.size]);

  useEffect(() => {
    if (!open || !prepared?.requests.length) return;
    const next = new Set(seen);
    prepared.requests.forEach((request) => next.add(request.id));
    if (next.size === seen.size) return;
    setSeen(next);
    sessionStorage.setItem(seenKey, JSON.stringify([...next]));
  }, [open, prepared?.requests, seen, seenKey]);

  if (!snapshot || !prepared || prepared.requests.length === 0) return null;
  const setRailOpen = (next: boolean) => {
    setOpen(next);
    sessionStorage.setItem(collapsedKey, String(!next));
  };
  const act = async (requestId: string, action: "acknowledge" | "resolve" | "cancel", name: string) => {
    try {
      setSnapshot(await dataStore.requestAction(classId, requestId, action));
      if (action !== "acknowledge") setUndo({ id: requestId, name, action: action === "resolve" ? "resolved" : "cleared" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That request could not be updated.");
    }
  };
  const wait = (joinedAt: string) => {
    const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(joinedAt)) / 60000));
    return minutes < 1 ? "just now" : `${minutes}m`;
  };

  return (
    <>
      <button className={`request-rail-toggle ${pulse ? "is-pulsing" : ""}`} onClick={() => setRailOpen(!open)} aria-expanded={open} aria-controls="request-rail" aria-label={`${open ? "Close" : "Open"} requests, ${prepared.requests.length} active, ${prepared.newIds.size} new`}>
        <span>Requests</span><b>{prepared.requests.length}</b>{prepared.newIds.size > 0 && <i>{prepared.newIds.size} new</i>}
      </button>
      <p className="sr-only" aria-live="polite">{prepared.alert}</p>
      {open && <button className="request-rail-scrim" aria-label="Close requests" onClick={() => setRailOpen(false)} />}
      {open && <aside id="request-rail" className="request-rail is-open" aria-label="Active student requests">
        <header>
          <div><p className="eyebrow">QUIET SIGNALS</p><h2>Requests <span>{prepared.requests.length}</span></h2></div>
          <button className="icon-button" onClick={() => setRailOpen(false)} aria-label="Close requests">×</button>
        </header>
        <label className="request-sound"><input type="checkbox" checked={sound} onChange={(event) => { setSound(event.target.checked); localStorage.setItem("request-alert-sound", String(event.target.checked)); }} /> Sound for new requests</label>
        <div className="request-rail-lanes">
          {prepared.lanes.filter((lane) => lane.requests.length > 0).map((lane) => {
            const isCompletion = lane.behavior === "completion";
            const expanded = !isCompletion || completionOpen[lane.id];
            const activeAttention = lane.behavior === "attention" ? lane.requests.find((request) => request.status === "active") : undefined;
            return <section className="request-rail-lane" key={lane.id} style={{ "--lane": lane.color } as CSSProperties}>
              <div className="request-lane-heading">
                {isCompletion ? <button onClick={() => setCompletionOpen((value) => ({ ...value, [lane.id]: !expanded }))} aria-expanded={expanded}><span>{lane.label}</span><b>{lane.requests.length}</b><i>{expanded ? "−" : "+"}</i></button> : <><strong>{lane.label}</strong><b>{lane.requests.length}</b></>}
                {lane.behavior === "attention" && activeAttention && <button className="request-next" onClick={async () => { try { setSnapshot(await dataStore.acknowledgeNextRequest(classId)); } catch (reason) { setError(reason instanceof Error ? reason.message : "The next request could not be selected."); } }}>Next</button>}
              </div>
              {expanded && <div className="request-items">
                {lane.requests.map((request, index) => {
                  const name = prepared.students.get(request.studentId)?.displayName ?? "Learner";
                  return <article className={`request-item ${request.status} ${prepared.newIds.has(request.id) ? "is-new" : ""}`} key={request.id}>
                    <div className="request-item-copy">
                      {lane.behavior === "attention" && <span className="request-position">{index + 1}</span>}
                      <span><strong>{name}</strong><small>{request.status === "acknowledged" ? "Acknowledged" : lane.behavior === "attention" ? `Waiting ${wait(request.joinedAt)}` : `Requested ${wait(request.joinedAt)}`}</small></span>
                    </div>
                    <div className="request-actions">
                      {request.status === "active" && <button onClick={() => act(request.id, "acknowledge", name)}>Acknowledge</button>}
                      <button className="request-resolve" onClick={() => act(request.id, "resolve", name)}>{lane.resolveLabel}</button>
                      <button aria-label={`Clear ${name}'s request`} onClick={() => act(request.id, "cancel", name)}>Clear</button>
                    </div>
                  </article>;
                })}
              </div>}
            </section>;
          })}
        </div>
      </aside>}
      {undo && <div className="request-undo" role="status"><span>{undo.name}'s request {undo.action}.</span><button onClick={async () => { try { setSnapshot(await dataStore.requestAction(classId, undo.id, "restore")); setUndo(undefined); } catch (reason) { setError(reason instanceof Error ? reason.message : "That request could not be restored."); } }}>Undo</button><button aria-label="Dismiss" onClick={() => setUndo(undefined)}>×</button></div>}
    </>
  );
}

export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty card">
      <span>✦</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
