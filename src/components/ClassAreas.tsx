import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Papa from "papaparse";
import QRCode from "qrcode";
import { dataStore } from "../data";
import { useApp } from "../state";
import type { RequestType, Student } from "../types";
import { manageRoster, rosterDuplicateRows, type ManageRosterFilter, type ManageRosterSort } from "../roster";

const avatarEmojis = ["🙂", "😀", "😎", "🤓", "🦊", "🐼", "🐙", "🌻", "⭐", "🚀"];
const avatarColors = ["#4f766f", "#3178a8", "#7656a8", "#7a6b42", "#c47b24", "#4b9d74"];
const avatarShapes = ["circle", "rounded", "square"];
const requestColors = ["#315f87", "#edbd4c", "#4b9d74", "#3178a8", "#7656a8", "#4f766f"];
const colorNames: Record<string, string> = { "#315f87": "Blue", "#edbd4c": "Gold", "#4b9d74": "Green", "#3178a8": "Sky", "#7656a8": "Purple", "#4f766f": "Forest" };

async function refresh(classId: string) {
  await dataStore.sync();
  return dataStore.getSnapshot(classId, true);
}

export function Roster() {
  const { snapshot, setSnapshot, setView } = useApp();
  const [filter, setFilter] = useState<ManageRosterFilter>("active");
  const [sort, setSort] = useState<ManageRosterSort>("name");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Student>();
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState("");
  const addButton = useRef<HTMLButtonElement>(null);
  const students = useMemo(() => snapshot ? manageRoster(snapshot.students, query, filter, sort) : [], [snapshot, query, filter, sort]);
  if (!snapshot) return null;

  const active = snapshot.students.filter((student) => !student.archived);
  const archived = snapshot.students.length - active.length;
  const positioned = active.filter((student) => student.x != null && student.y != null).length;
  const arrangeSeats = async () => {
    if (snapshot.classRoom.settings.layout !== "map") {
      setSnapshot(await dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/settings`, "PUT", { layout: "map" }));
    }
    sessionStorage.setItem("open-seating-arrange", snapshot.classRoom.id);
    setView("today");
  };

  return (
    <div className="roster-workflow">
      <section className="card form-card roster-overview">
        <div className="roster-heading">
          <div><p className="eyebrow">CLASS ROSTER</p><h2>Roster & seating</h2><p>Verify who is enrolled, then arrange the room learners recognize.</p></div>
          <div className="roster-heading-actions"><button ref={addButton} className="primary" type="button" onClick={() => setAdding(true)}>Add learners</button><button className="secondary" type="button" onClick={arrangeSeats}>Arrange seating</button></div>
        </div>
        <div className="roster-summary" aria-label="Roster summary">
          <div><strong>{active.length}</strong><span>Active</span></div><div><strong>{archived}</strong><span>Archived</span></div>
          <div className="seating-summary"><strong>{positioned ? `${positioned}/${active.length}` : "Not arranged"}</strong><span>{positioned ? "Seats positioned" : "Seating map"}</span></div>
          <button className="text-button" type="button" disabled={!positioned} onClick={() => setResetting(true)}>Reset seating</button>
        </div>
        {message && <p className="success-note" role="status">{message}</p>}
        <div className="roster-controls">
          <label className="roster-search-manage"><span>Search learners</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by display name or tag" /></label>
          <fieldset className="segmented" aria-label="Roster status">{(["active", "archived", "all"] as const).map((item) => <button type="button" className={filter === item ? "active-button" : "secondary"} onClick={() => setFilter(item)} key={item}>{item[0].toUpperCase() + item.slice(1)}</button>)}</fieldset>
          <label className="roster-sort">Sort <select value={sort} onChange={(event) => setSort(event.target.value as ManageRosterSort)}><option value="name">Name A-Z</option><option value="enrollment">Newest enrollment</option></select></label>
        </div>
        <div className="roster-result-count">Showing {students.length} of {snapshot.students.length} learners</div>
        {students.length ? <ul className="roster-list manage-roster-list">
          {students.map((student) => <li key={student.id}>
            <span className={`avatar mini avatar-${student.avatar.shape}`} style={{ background: student.avatar.color }}>{student.avatar.emoji}</span>
            <div className="roster-identity"><strong>{student.displayName}</strong><div className="roster-tags">{student.tags.length ? student.tags.map((tag) => <span key={tag}>{tag}</span>) : <small>No tags</small>}</div></div>
            <div className="roster-enrollment"><span>Enrolled</span><strong>{formatDate(student.enrolledAt)}</strong></div>
            <span className={`status-chip ${student.archived ? "archived" : "active"}`}>{student.archived ? "Archived" : "Active"}</span>
            <button className="secondary" type="button" onClick={() => setEditing(student)}>Edit</button>
          </li>)}
        </ul> : <p className="empty-note">No learners match this filter.</p>}
        <p className="privacy-note">Use the display name learners know. Do not enter student IDs, email addresses, birth dates, or other private information.</p>
      </section>
      {adding && <AddLearnersDialog existing={snapshot.students} onClose={() => { setAdding(false); addButton.current?.focus(); }} onAdded={async (count) => { setSnapshot(await refresh(snapshot.classRoom.id)); setAdding(false); setFilter("active"); setQuery(""); setMessage(`${count} learner${count === 1 ? "" : "s"} added successfully.`); window.setTimeout(() => addButton.current?.focus()); }} />}
      {editing && <StudentDialog student={editing} onClose={() => setEditing(undefined)} onSave={async (body) => {
        setSnapshot(await dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/students/${editing.id}`, "PATCH", body));
        setEditing(undefined);
      }} />}
      {resetting && <ConfirmDialog title="Reset all seat positions?" confirmLabel="Reset seating" onClose={() => setResetting(false)} onConfirm={async () => { setSnapshot(await dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/seating/reset`, "POST")); setResetting(false); setMessage("Seating positions reset. Class-day evidence was not changed."); }}><p>This clears the saved room arrangement for every learner. Attendance, participation, and skill evidence stay with each learner and do not move.</p></ConfirmDialog>}
    </div>
  );
}

function AddLearnersDialog({ existing, onClose, onAdded }: { existing: Student[]; onClose: () => void; onAdded: (count: number) => Promise<void> }) {
  const { snapshot } = useApp();
  const [mode, setMode] = useState<"paste" | "csv">("paste");
  const [names, setNames] = useState("");
  const [preview, setPreview] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const duplicateRows = rosterDuplicateRows(preview, existing.map((student) => student.displayName));
  const duplicateCount = duplicateRows.filter((row) => row.existing || row.upload).length;
  const parse = (value: string) => setPreview(value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean));
  const upload = (file?: File) => file && Papa.parse<Record<string, string>>(file, {
    header: true,
    skipEmptyLines: true,
    complete: ({ data }) => {
      setConfirmed(false);
      setPreview(data.map((row) => row.name || row.Name || row.displayName || Object.values(row)[0]).map((name) => name?.trim()).filter(Boolean));
    },
  });
  const add = async () => {
    if (!snapshot || saving || !preview.length || (duplicateCount && !confirmed)) return;
    setSaving(true);
    try {
      await dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/roster`, "POST", {
        importId: crypto.randomUUID(),
        students: preview.map((displayName, index) => ({ displayName, avatar: autoAvatar(existing.length + index) })),
      });
      await dataStore.sync();
      await onAdded(preview.length);
    } finally { setSaving(false); }
  };
  return <div className="modal-backdrop"><section className="card modal add-roster-modal" role="dialog" aria-modal="true" aria-labelledby="add-roster-title">
    <div className="section-heading"><div><h2 id="add-roster-title">Add learners</h2><p>Add display names only. You can personalize tags and avatars afterward.</p></div><button className="secondary" type="button" onClick={onClose}>Close</button></div>
    <div className="tab-buttons" role="tablist"><button type="button" role="tab" aria-selected={mode === "paste"} className={mode === "paste" ? "active-button" : "secondary"} onClick={() => setMode("paste")}>Paste list</button><button type="button" role="tab" aria-selected={mode === "csv"} className={mode === "csv" ? "active-button" : "secondary"} onClick={() => setMode("csv")}>Upload CSV</button></div>
    {mode === "paste" ? <label>One display name per line<textarea autoFocus rows={7} value={names} onChange={(event) => { setNames(event.target.value); setConfirmed(false); parse(event.target.value); }} placeholder={"Avery R.\nJordan K.\nSam P."} /></label> : <div className="csv-choice"><p>Use a column named <strong>name</strong> or <strong>displayName</strong>.</p><label className="secondary file-button">Choose CSV file<input type="file" accept=".csv,text/csv" onChange={(event) => upload(event.target.files?.[0])} /></label><a className="text-button" href="data:text/csv;charset=utf-8,name%0AAvery%20R.%0AJordan%20K." download="roster-template.csv">Download template</a></div>}
    {preview.length > 0 && <div className="roster-preview"><h3>Preview <span>{preview.length} learners</span></h3><ul>{preview.map((name, index) => <li key={`${name}-${index}`}><span className={`avatar mini avatar-${autoAvatar(existing.length + index).shape}`} style={{ background: autoAvatar(existing.length + index).color }}>{autoAvatar(existing.length + index).emoji}</span><strong>{name}</strong>{duplicateRows[index].existing && <small>Matches an existing display name</small>}{duplicateRows[index].upload && <small>Repeated in this upload</small>}</li>)}</ul></div>}
    {duplicateCount > 0 && <label className="duplicate-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>Confirm {duplicateCount} possible duplicate{duplicateCount === 1 ? "" : "s"}</strong>Same display names can be valid. Check the preview, then confirm to add everyone as listed.</span></label>}
    <p className="privacy-note">Do not include student IDs, email addresses, birth dates, or other private information.</p>
    <div className="button-row"><button className="secondary" type="button" onClick={onClose}>Cancel</button><button className="primary" type="button" disabled={!preview.length || saving || Boolean(duplicateCount && !confirmed)} onClick={add}>{saving ? "Adding learners..." : `Add ${preview.length || ""} learner${preview.length === 1 ? "" : "s"}`}</button></div>
  </section></div>;
}

function autoAvatar(index: number) {
  return { emoji: avatarEmojis[index % avatarEmojis.length], color: avatarColors[Math.floor(index / avatarEmojis.length + index) % avatarColors.length], shape: avatarShapes[Math.floor(index / avatarColors.length) % avatarShapes.length] };
}

function ConfirmDialog({ title, confirmLabel, onClose, onConfirm, children }: { title: string; confirmLabel: string; onClose: () => void; onConfirm: () => Promise<void>; children: ReactNode }) {
  const [saving, setSaving] = useState(false);
  return <div className="modal-backdrop"><section className="card modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">{title}</h2>{children}<div className="button-row"><button className="secondary" type="button" onClick={onClose}>Cancel</button><button className="danger-button" type="button" disabled={saving} onClick={async () => { setSaving(true); try { await onConfirm(); } finally { setSaving(false); } }}>{saving ? "Saving..." : confirmLabel}</button></div></section></div>;
}

function StudentDialog({ student, onClose, onSave }: { student: Student; onClose: () => void; onSave: (body: Record<string, unknown>) => Promise<void> }) {
  const { snapshot, setSnapshot } = useApp();
  const [displayName, setDisplayName] = useState(student.displayName);
  const [emoji, setEmoji] = useState(student.avatar.emoji);
  const [color, setColor] = useState(student.avatar.color);
  const [shape, setShape] = useState(student.avatar.shape);
  const [tags, setTags] = useState(student.tags);
  const [enrolledAt, setEnrolledAt] = useState(student.enrolledAt?.slice(0, 10) ?? "");
  const [archived, setArchived] = useState(student.archived);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [tagName, setTagName] = useState("");
  return <div className="modal-backdrop"><form className="card modal" role="dialog" aria-modal="true" aria-labelledby="edit-student-title" onSubmit={async (event) => {
    event.preventDefault();
    await onSave({ displayName: displayName.trim(), avatar: { emoji, color, shape }, tags, archived, ...(enrolledAt ? { enrolledAt: `${enrolledAt}T00:00:00.000Z` } : {}) });
  }}>
    <h2 id="edit-student-title">Edit learner</h2>
    <label>Display name learners recognize<input autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
    <fieldset className="choice-field"><legend>Avatar emoji</legend><div className="choice-row">{avatarEmojis.map((item) => <label className={emoji === item ? "selected" : ""} key={item}><input type="radio" name="emoji" value={item} checked={emoji === item} onChange={() => setEmoji(item)} /><span>{item}</span></label>)}</div></fieldset>
    <fieldset className="choice-field"><legend>Avatar color</legend><div className="choice-row">{avatarColors.map((item) => <label className={color === item ? "selected" : ""} key={item} style={{ background: item }}><input type="radio" name="color" value={item} checked={color === item} onChange={() => setColor(item)} /><span className="sr-only">{item}</span></label>)}</div></fieldset>
    <label>Avatar shape<select value={shape} onChange={(event) => setShape(event.target.value)}>{avatarShapes.map((item) => <option key={item}>{item}</option>)}</select></label>
    <fieldset className="tag-field"><legend>Teacher tags</legend><div className="tag-options">{snapshot?.tags.map((tag) => <label key={tag.id}><input type="checkbox" checked={tags.includes(tag.label)} onChange={(event) => setTags(event.target.checked ? [...tags, tag.label] : tags.filter((item) => item !== tag.label))} /> {tag.label}</label>)}</div><div className="inline-form button-row"><input aria-label="New teacher tag" value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="Add a tag, e.g. Table 2" /><button className="secondary" type="button" disabled={!tagName.trim()} onClick={async () => { if (!snapshot || !tagName.trim()) return; const label = tagName.trim(); await dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/tags`, "POST", { label }); await dataStore.sync(); setSnapshot(await refresh(snapshot.classRoom.id)); setTags(tags.includes(label) ? tags : [...tags, label]); setTagName(""); }}>Add tag</button></div></fieldset>
    <label>Enrollment date<input type="date" value={enrolledAt} onChange={(event) => setEnrolledAt(event.target.value)} /></label>
    <div className="archive-action"><div><strong>{archived ? "Archived learner" : "Active learner"}</strong><p>{archived ? "Restore this learner to Today and the active roster." : "Archive safely instead of deleting. Their history is retained."}</p></div><button type="button" className={archived ? "primary" : "secondary"} onClick={() => archived ? setArchived(false) : setConfirmArchive(true)}>{archived ? "Restore learner" : "Archive learner"}</button></div>
    <p className="privacy-note">Use a familiar display name. Avoid legal names when they are not normally used, and do not add contact details or identifiers.</p>
    <div className="button-row"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!displayName.trim()}>Save learner</button></div>
    {confirmArchive && <ConfirmDialog title="Archive this learner?" confirmLabel="Archive learner" onClose={() => setConfirmArchive(false)} onConfirm={async () => { setArchived(true); setConfirmArchive(false); }}><p>They will be removed from Today and the active roster. Attendance, participation, skill evidence, and class history are retained, and you can restore them later.</p></ConfirmDialog>}
  </form></div>;
}

export function StudentAccess() {
  const { snapshot, setSnapshot } = useApp();
  const [qrCode, setQrCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<RequestType | null>();
  const [message, setMessage] = useState("");
  const joinLink = snapshot ? `${location.origin}/join/${snapshot.classRoom.joinCode}` : "";
  useEffect(() => { void QRCode.toDataURL(joinLink, { width: 240, margin: 1, color: { dark: "#173f35", light: "#fffdf7" } }).then(setQrCode); }, [joinLink]);
  if (!snapshot) return null;
  return <div className="settings-grid access-grid">
    <section className="card form-card student-access-card">
      <p className="eyebrow">STUDENT ACCESS</p><h2>Share this class</h2>
      <p>Students use their teacher-chosen display name. They do not need an account.</p>
      <div className="join-code"><span>Join code</span><strong>{snapshot.classRoom.joinCode}</strong></div>
      <a className="class-link" href={joinLink} target="_blank" rel="noreferrer">{joinLink}</a>
      <div className="button-row"><button className="primary" type="button" onClick={async () => { await navigator.clipboard.writeText(joinLink); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }}>{copied ? "Copied" : "Copy class link"}</button><a className="secondary" href={joinLink} target="_blank" rel="noreferrer">Preview student view</a></div>
      {qrCode && <img className="join-qr-static" src={qrCode} alt={`QR code to join ${snapshot.classRoom.name}`} />}
      <p className="privacy-note">The student view includes participation and quiet requests. Teacher attendance, skills, photos, and support flags stay private.</p>
    </section>
    <section className="card form-card request-type-card">
      <div className="section-heading"><div><h2>Request types</h2><p>Choose the requests learners can send from their view.</p></div><button className="secondary" type="button" onClick={() => { setEditing(null); setMessage(""); }}>Add request type</button></div>
      {message && <p className="status-note" role="status">{message}</p>}
      <ul className="request-type-list">{snapshot.requestTypes.map((type) => <li key={type.id}><i style={{ background: type.color }} /><div><strong>{type.label}</strong><small>{behaviorLabel(type.behavior)} · button says “{type.resolveLabel}” when resolved</small></div><button className="secondary" type="button" onClick={() => { setEditing(type); setMessage(""); }}>Edit</button></li>)}</ul>
      {editing !== undefined && <RequestTypeDialog type={editing} onClose={() => setEditing(undefined)} onSave={async (body) => {
        const path = editing ? `/classes/${snapshot.classRoom.id}/request-types/${editing.id}` : `/classes/${snapshot.classRoom.id}/request-types`;
        await dataStore.mutate(snapshot.classRoom.id, path, editing ? "PATCH" : "POST", body);
        setSnapshot(await refresh(snapshot.classRoom.id));
        setEditing(undefined);
      }} onDelete={editing ? async () => {
        await dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/request-types/${editing.id}`, "DELETE");
        const latest = await refresh(snapshot.classRoom.id);
        setSnapshot(latest);
        if (latest.requestTypes.some((item) => item.id === editing.id)) setMessage("This request type has class history, so it cannot be deleted. You can rename it instead.");
        setEditing(undefined);
      } : undefined} />}
    </section>
  </div>;
}

function RequestTypeDialog({ type, onClose, onSave, onDelete }: { type: RequestType | null; onClose: () => void; onSave: (body: Omit<RequestType, "id" | "classId">) => Promise<void>; onDelete?: () => Promise<void> }) {
  const [label, setLabel] = useState(type?.label ?? "");
  const [color, setColor] = useState(type?.color ?? requestColors[0]);
  const [behavior, setBehavior] = useState<RequestType["behavior"]>(type?.behavior ?? "custom");
  const [resolveLabel, setResolveLabel] = useState(type?.resolveLabel ?? "Resolve");
  const [confirmDelete, setConfirmDelete] = useState(false);
  return <div className="modal-backdrop"><form className="card modal" role="dialog" aria-modal="true" aria-labelledby="request-editor-title" onSubmit={async (event) => { event.preventDefault(); await onSave({ label: label.trim(), color, behavior, resolveLabel: resolveLabel.trim() }); }}>
    <h2 id="request-editor-title">{type ? "Edit" : "Add"} request type</h2>
    <label>Student-facing label<input autoFocus value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Need a check-in" /></label>
    <fieldset className="choice-field"><legend>Color</legend><div className="choice-row">{requestColors.map((item) => <label className={color === item ? "selected" : ""} key={item} style={{ background: item }}><input type="radio" name="request-color" checked={color === item} onChange={() => setColor(item)} /><span className="sr-only">{colorNames[item]}</span></label>)}</div></fieldset>
    <label>Behavior<select value={behavior} onChange={(event) => setBehavior(event.target.value as RequestType["behavior"])}><option value="attention">Attention: joins the help queue</option><option value="presence">Presence: learner leaves and returns</option><option value="completion">Completion: work is ready to review</option><option value="custom">Custom: general request</option></select></label>
    <label>Resolve button label<input value={resolveLabel} onChange={(event) => setResolveLabel(event.target.value)} placeholder="e.g. Helped" /></label>
    {onDelete && <label className="danger-confirm"><input type="checkbox" checked={confirmDelete} onChange={(event) => setConfirmDelete(event.target.checked)} /> Allow deletion if this type has no class history</label>}
    <div className="button-row"><button type="button" className="secondary" onClick={onClose}>Cancel</button>{onDelete && <button type="button" className="danger-button" disabled={!confirmDelete} onClick={onDelete}>Delete</button>}<button className="primary" disabled={!label.trim() || !resolveLabel.trim()}>Save</button></div>
  </form></div>;
}

export function ClassSettings() {
  const { snapshot, setSnapshot, classes, setClasses } = useApp();
  const [name, setName] = useState(snapshot?.classRoom.name ?? "");
  const [settingsError, setSettingsError] = useState("");
  if (!snapshot) return null;
  const settings = snapshot.classRoom.settings;
  const updateSettings = async (body: Record<string, unknown>) => {
    const next = { ...settings, ...body };
    for (const [label, value] of [["Watch", next.participationWatchAfter], ["Check in", next.participationCheckInAfter]] as const) {
      if (value !== null && (!Number.isInteger(value) || value < 1 || value > 100)) {
        setSettingsError(`${label} must be a whole number from 1 to 100`);
        return;
      }
    }
    if (next.participationWatchAfter !== null && next.participationCheckInAfter !== null && next.participationCheckInAfter < next.participationWatchAfter) {
      setSettingsError("Check in must be greater than or equal to Watch");
      return;
    }
    try {
      setSettingsError("");
      setSnapshot(await dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/settings`, "PUT", body));
      setClasses(classes.map((room) => room.id === snapshot.classRoom.id ? { ...room, settings: { ...room.settings, ...body } } : room));
    } catch (error) { setSettingsError(error instanceof Error ? error.message : "Participation guidance could not be saved."); }
  };
  return <div className="settings-stack">
    <div className="settings-grid">
      <section className="card form-card"><h2>Class details</h2><form onSubmit={async (event) => { event.preventDefault(); const next = name.trim(); if (!next) return; setSnapshot(await dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}`, "PATCH", { name: next })); setClasses(classes.map((room) => room.id === snapshot.classRoom.id ? { ...room, name: next } : room)); }}><label>Class name<input value={name} onChange={(event) => setName(event.target.value)} /></label><button className="primary" disabled={!name.trim() || name.trim() === snapshot.classRoom.name}>Save class name</button></form></section>
      <section className="card form-card"><h2>Classroom layout</h2><p>Choose the starting layout for Today. Existing seating coordinates are preserved.</p><fieldset className="layout-options"><legend>Default roster layout</legend><label><input type="radio" checked={settings.layout === "grid"} onChange={() => updateSettings({ layout: "grid" })} /> Automatic grid</label><label><input type="radio" checked={settings.layout === "map"} onChange={() => updateSettings({ layout: "map" })} /> Seating map</label></fieldset></section>
      <section className="card form-card participation-guidance"><h2>Participation guidance</h2><p>Only eligible class days count. Absences, independent work, and assessments do not count.</p><label>Watch after eligible class days<input type="number" min="1" max="100" disabled={settings.participationWatchAfter === null} value={settings.participationWatchAfter ?? 2} onChange={(event) => { const value = event.currentTarget.valueAsNumber; if (Number.isInteger(value)) void updateSettings({ participationWatchAfter: value }); }}/></label><label className="disable-threshold"><input type="checkbox" checked={settings.participationWatchAfter === null} onChange={(event) => void updateSettings({ participationWatchAfter: event.target.checked ? null : 2 })}/> Disable Watch</label><p>Watch when a learner has completed {settings.participationWatchAfter ?? "N"} eligible class days without a recorded Positive Action.</p><label>Check in after eligible class days<input type="number" min="1" max="100" disabled={settings.participationCheckInAfter === null} value={settings.participationCheckInAfter ?? 3} onChange={(event) => { const value = event.currentTarget.valueAsNumber; if (Number.isInteger(value)) void updateSettings({ participationCheckInAfter: value }); }}/></label><label className="disable-threshold"><input type="checkbox" checked={settings.participationCheckInAfter === null} onChange={(event) => void updateSettings({ participationCheckInAfter: event.target.checked ? null : Math.max(3, settings.participationWatchAfter ?? 1) })}/> Disable Check in</label><p>Check in when a learner has completed {settings.participationCheckInAfter ?? "N"} eligible class days without a recorded Positive Action.</p>{settingsError && <p className="form-error" role="alert">{settingsError}</p>}</section>
    </div>
    <DataTools />
    <section className="card form-card archive-card"><h2>{settings.archived ? "Restore class" : "Archive class"}</h2><p>{settings.archived ? "Restore this class to active use. All roster and history remain available." : "Hide this class from active use without deleting its roster, calendar, or history."}</p><button type="button" className={settings.archived ? "primary" : "secondary"} onClick={() => updateSettings({ archived: !settings.archived })}>{settings.archived ? "Restore class" : "Archive class"}</button></section>
  </div>;
}

function DataTools() {
  const { snapshot } = useApp();
  const [status, setStatus] = useState("");
  if (!snapshot) return null;
  const importJson = async (file?: File) => {
    if (!file) return;
    setStatus("Restoring backup...");
    const response = await fetch("/api/import/json", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: await file.text() });
    if (!response.ok) { setStatus("The backup could not be restored."); return; }
    location.reload();
  };
  return <section className="card form-card data-card"><details><summary><strong>Data backup & exports</strong><span>Download reports or restore a class backup</span></summary><p>Reports include participation, attendance, achievements, and evidence counts. The JSON backup contains the class records, but photo binaries are excluded, and restores as a new class. Store files according to your school's privacy policy.</p><div className="export-grid"><a className="secondary" href={`/api/classes/${snapshot.classRoom.id}/reports/export/csv?range=all`}>CSV report</a><a className="secondary" href={`/api/classes/${snapshot.classRoom.id}/reports/export/xlsx?range=all`}>Excel report</a><a className="secondary" href={`/api/classes/${snapshot.classRoom.id}/export/json`}>JSON backup</a><label className="secondary file-button">Restore JSON<input type="file" accept=".json,application/json" onChange={(event) => importJson(event.target.files?.[0])} /></label></div>{status && <p role="status">{status}</p>}</details></section>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="toggle-row"><span>{label}</span><input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "date unavailable";
}

function behaviorLabel(behavior: RequestType["behavior"]) {
  return behavior === "attention" ? "Attention queue" : behavior === "presence" ? "Leaves and returns" : behavior === "completion" ? "Ready for review" : "General request";
}
