import { useRef, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from "react";
import type { AttendanceStatus, Student } from "../types";

type TileProps = {
  student: Student;
  attendance?: AttendanceStatus;
  positives?: number;
  negatives?: number;
  detail?: string;
  selected?: boolean;
  requestLabel?: string;
  attendancePass?: boolean;
  arranging?: boolean;
  participation?: boolean;
  seatingScale?: number;
  showCardActions?: boolean;
  notLogged?: boolean;
  feedback?: "positive" | "redirect";
  onTap?: () => void;
  onPositive?: () => void;
  onNegative?: () => void;
  onHold?: () => void;
  onAttendance?: () => void;
  onMoveStart?: (x: number, y: number) => void;
  onMove?: (x: number, y: number) => void;
  onMoveEnd?: (x: number, y: number) => void;
};

export function StudentTile({
  student,
  attendance = "present",
  positives,
  negatives,
  detail,
  selected,
  requestLabel,
  attendancePass,
  arranging,
  participation,
  seatingScale,
  showCardActions = true,
  notLogged,
  feedback,
  onTap,
  onPositive,
  onNegative,
  onHold,
  onAttendance,
  onMoveStart,
  onMove,
  onMoveEnd,
}: TileProps) {
  const hold = useRef<number>();
  const moved = useRef(false);
  const position = useRef({ x: student.x ?? 0, y: student.y ?? 0 });
  const pointerDown = (event: PointerEvent) => {
    moved.current = false;
    if (onMove) {
      event.currentTarget.setPointerCapture(event.pointerId);
      onMoveStart?.(event.clientX, event.clientY);
    }
    hold.current = window.setTimeout(() => {
      moved.current = true;
      navigator.vibrate?.(25);
      onHold?.();
    }, 550);
  };
  const pointerMove = (event: PointerEvent) => {
    if (!onMove || !(event.buttons & 1)) return;
    event.preventDefault();
    moved.current = true;
    position.current = { x: event.clientX, y: event.clientY };
    onMove(event.clientX, event.clientY);
  };
  const pointerUp = () => {
    clearTimeout(hold.current);
    if (moved.current) {
      onMoveEnd?.(position.current.x, position.current.y);
      return;
    }
    onTap?.();
  };
  const content = (
    <>
      <span className="student-identity">
        <span
          className="avatar"
          style={{ "--avatar": student.avatar.color } as CSSProperties}
        >
          {student.avatar.emoji}
        </span>
        <strong>{student.displayName}</strong>
      </span>
      {detail && <small>{detail}</small>}
    </>
  );
  return (
    <article
      className={`student-tile ${attendance === "absent" ? "is-absent" : ""} ${selected ? "is-selected" : ""} ${attendancePass ? "attendance-pass-tile" : ""} ${arranging ? "is-arranging" : ""} ${participation ? "participation-tile" : ""} ${participation && !showCardActions ? "card-actions-hidden" : ""} ${seatingScale !== undefined ? `seating-tile ${seatingScale < 0.55 ? "seating-tile-tiny" : ""}` : ""} ${notLogged ? "not-logged" : ""} ${feedback ? `flash-${feedback}` : ""}`}
    >
      {participation && !arranging ? (
        <button
          className="tile-main participation-summary"
          type="button"
          onClick={onTap}
          aria-label={`${student.displayName}, ${attendance}. Use Positive Action or Redirect to record participation.`}
        >
          {content}
          {notLogged && attendance !== "absent" && <span className="today-participation not-heard">○ Not heard today</span>}
        </button>
      ) : (
        <button
          className="tile-main"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          type="button"
          aria-label={`${student.displayName}, ${attendance}`}
        >
          {content}
        </button>
      )}
      {!arranging && !participation && (
        <button
          className="attendance-chip"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAttendance?.();
          }}
          aria-label={`Mark ${student.displayName} ${attendance === "absent" ? "present" : "absent"}`}
        >
          <span aria-hidden="true">{attendance === "absent" ? "A" : "P"}</span><span className="sr-only">{attendance === "absent" ? "Absent" : "Present"}</span>
        </button>
      )}
      {arranging && <span className="move-handle">Move seat</span>}
      {requestLabel && !arranging && (
        <span
          className="request-indicator"
          aria-label={`Active request: ${requestLabel}`}
          title={requestLabel}
        >
          ! Request
        </span>
      )}
      {participation &&
        !attendancePass &&
          !arranging && showCardActions && (
          <div className="participation-actions">
            <button
              className="positive-action"
              type="button"
              disabled={attendance === "absent"}
              onClick={(event) => {
                event.stopPropagation();
                onPositive?.();
              }}
              aria-label={`Add Positive Action for ${student.displayName}`}
            >
              <span>
                <b>+</b> <span className="action-label-full">Positive Action</span><span className="action-label-short">Action</span>
              </span>
              <small>{positives ?? 0} today</small>
            </button>
            <button
              className="redirect-action"
              type="button"
              disabled={attendance === "absent"}
              onClick={(event) => {
                event.stopPropagation();
                onNegative?.();
              }}
              aria-label={`Record Redirect for ${student.displayName}`}
            >
              <span>
                <b>−</b> <span className="action-label-full">Redirect</span><span className="action-label-short">Redirect</span>
              </span>
              <small>{negatives ?? 0} today</small>
            </button>
          </div>
        )}
    </article>
  );
}

export function StudentGrid({
  students,
  layout = "grid",
  density = "comfortable",
  mapControls,
  viewportRef,
  canvasRef,
  canvasStyle,
  stageStyle,
  children,
}: {
  students: Student[];
  layout?: "grid" | "map";
  density?: "comfortable" | "compact" | "overview";
  mapControls?: ReactNode;
  viewportRef?: RefObject<HTMLDivElement>;
  canvasRef?: RefObject<HTMLDivElement>;
  canvasStyle?: CSSProperties;
  stageStyle?: CSSProperties;
  children: (student: Student, index: number) => React.ReactNode;
}) {
  const grid = (
    <div
      className={`student-grid roster-${density} ${density === "overview" && students.length > 35 ? "roster-36-plus" : ""} ${layout === "map" ? "student-map" : ""}`}
      aria-label="Students"
      ref={layout === "map" ? canvasRef : undefined}
      style={layout === "map" ? canvasStyle : undefined}
    >
      {students.map(children)}
    </div>
  );
  return layout === "map" ? (
    <div className="student-map-viewport" ref={viewportRef}>
      {mapControls}
      <div className="student-map-stage" style={stageStyle}>{grid}</div>
    </div>
  ) : (
    grid
  );
}
