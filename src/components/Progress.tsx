import { useEffect, useMemo, useState, type FormEvent } from "react";
import { achievementDisplay, achievementOptions } from "../assessment";
import { dataStore } from "../data";
import { useApp } from "../state";
import type { Achievement, AllClassProgressRow, ClassReport, ClassSnapshot, ParentSummary, ParticipationAction, Period, ReportSkill, ReportStudent, SkillPhoto, StudentGroup } from "../types";

type ReportTab = "insights" | "participation" | "skills" | "groups";
type Range = "last5" | "last10" | "week" | "all" | "custom";
type InsightSort = "name" | "participation" | "lastAction";
type SortDirection = "ascending" | "descending";
type Snapshot = NonNullable<ClassSnapshot>;

export function Progress() {
  const { snapshot, classId, setSnapshot } = useApp();
  const [tab, setTab] = useState<ReportTab>("insights");
  const [range, setRange] = useState<Range>("last5");
  const [tag, setTag] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<ClassReport>();
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"current" | "all">("current");

  const reportQuery = useMemo(() => {
    const value = new URLSearchParams({ range });
    if (range === "custom") {
      if (from) value.set("from", new Date(`${from}T00:00:00`).toISOString());
      if (to) value.set("to", new Date(`${to}T23:59:59`).toISOString());
    }
    if (tag) value.set("tag", tag);
    if (query.trim()) value.set("search", query.trim());
    return value;
  }, [from, query, range, tag, to]);

  useEffect(() => {
    if (scope !== "current" || !classId || range === "custom" && (!from || !to)) return;
    let current = true;
    setLoading(true);
    void dataStore.getReport(classId, reportQuery.toString()).then((value) => {
      if (current) setReport(value);
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [classId, from, range, reportQuery, scope, snapshot?.attendance.length, snapshot?.events.length, snapshot?.mastery.length, tag, to]);

  const students = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (report?.students ?? []).filter((student) => !needle || student.displayName.toLocaleLowerCase().includes(needle));
  }, [query, report]);
  const selected = report?.students.find((student) => student.studentId === selectedId);
  if (!snapshot) return null;

  const refresh = async () => {
    await dataStore.sync();
    setSnapshot(await dataStore.getSnapshot(classId, true));
    setReport(await dataStore.getReport(classId, reportQuery.toString()));
  };
  const changeScope = (nextScope: "current" | "all") => {
    setScope(nextScope);
    setSelectedId(undefined);
  };
  return <section className="reports-page">
    <div className="page-heading"><div><p className="eyebrow">COUNTS AND EVIDENCE</p><h1>Insights</h1></div><div className="button-row"><label>Scope<select value={scope} onChange={(event) => changeScope(event.target.value as "current" | "all")}><option value="current">Current class</option><option value="all">All classes</option></select></label>
      {scope === "current" && <><button className="secondary" onClick={() => { location.href = `/api/classes/${classId}/reports/export/csv?${reportQuery}`; }}>Export CSV</button>
      <button className="secondary" onClick={() => { location.href = `/api/classes/${classId}/reports/export/xlsx?${reportQuery}`; }}>Export Excel</button></>}
    </div></div>
    {scope === "all" ? <AllClasses /> : <><section className="report-bar card" aria-label="Report filters">
      <label>Class days<select value={range} onChange={(event) => setRange(event.target.value as Range)}><option value="last5">Last 5 class days</option><option value="last10">Last 10 class days</option><option value="week">This school week</option><option value="all">All class days</option><option value="custom">Custom dates</option></select></label>
      {range === "custom" && <><label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></label><label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)}/></label></>}
      <label>Teacher tag<select value={tag} onChange={(event) => setTag(event.target.value)}><option value="">Every learner</option>{snapshot.tags.map((item) => <option value={item.label} key={item.id}>{item.label}</option>)}</select></label>
      <label>Find learner<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search display names"/></label>
    </section>
     <nav className="report-tabs" aria-label="Insights sections">{(["insights", "participation", "skills", "groups"] as ReportTab[]).map((item) => <button className={tab === item ? "active" : ""} aria-current={tab === item ? "page" : undefined} onClick={() => setTab(item)} key={item}>{item}</button>)}</nav>
     {loading && <p className="loading-inline" role="status">Updating report...</p>}
     {tab === "groups" && <GroupSettings />}
     {!loading && report && <>
      {tab === "insights" && <Insights report={report} students={students} onSelect={setSelectedId}/>} 
      {tab === "participation" && <Participation students={students} report={report} onSelect={setSelectedId}/>}
       {tab === "skills" && <Skills report={report} students={students}/>}
    </>}
    {selected && report && <StudentEvidence classId={classId} student={selected} report={report} snapshot={snapshot} onRefresh={refresh} onClose={() => setSelectedId(undefined)}/>} 
    </>}
  </section>;
}

function AllClasses() {
  const { classes } = useApp();
  const [rows, setRows] = useState<AllClassProgressRow[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1);
  const [search, setSearch] = useState(""); const [classId, setClassId] = useState(""); const [support, setSupport] = useState(""); const [sort, setSort] = useState<"class" | "name" | "support" | "absence">("class");
  useEffect(() => { const query = new URLSearchParams({ page: String(page), pageSize: "100" }); if (search) query.set("search", search); if (classId) query.set("classId", classId); if (support) query.set("support", support); void dataStore.getAllProgress(query.toString()).then((value) => { setRows(value.rows); setTotal(value.total); }); }, [classId, page, search, support]);
  useEffect(() => setPage(1), [classId, search, support]);
  const ordered = [...rows].sort((a, b) => sort === "name" ? a.displayName.localeCompare(b.displayName) : sort === "support" ? b.supportCount - a.supportCount || a.displayName.localeCompare(b.displayName) : sort === "absence" ? b.absenceCount - a.absenceCount || a.displayName.localeCompare(b.displayName) : a.className.localeCompare(b.className) || a.displayName.localeCompare(b.displayName));
  const start = total ? (page - 1) * 100 + 1 : 0; const end = Math.min(page * 100, total);
  return <><section className="report-bar card"><label>Find learner<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search display names"/></label><label>Class<select value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">All classes</option>{classes.map((room) => <option value={room.id} key={room.id}>{room.name}</option>)}</select></label><label>Support<select value={support} onChange={(event) => setSupport(event.target.value)}><option value="">All learners</option><option value="yes">Has support flags</option><option value="no">No support flags</option></select></label><label>Sort<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="class">Class</option><option value="name">Learner</option><option value="support">Most support flags</option><option value="absence">Most absences</option></select></label></section><section className="matrix-wrap card"><div className="section-heading"><h2>All-class learner evidence</h2><strong>{start}-{end} of {total}</strong></div><table className="report-table all-class-table"><thead><tr><th>Learner</th><th>Class</th><th>Positive Action days</th><th>Absences</th><th>Skill evidence</th><th>Meet/exceed</th><th>Support flags</th><th>Last action</th></tr></thead><tbody>{ordered.map((row) => <tr key={`${row.classId}:${row.studentId}`}><th>{row.displayName}</th><td>{row.className}</td><td>{row.positiveActionDays}/{row.eligibleDays}</td><td>{row.absenceCount}/{row.enrolledClassDays}</td><td>{row.evidenceCount}/{row.totalSkills}</td><td>{row.meetOrExceedCount}/{row.totalSkills}</td><td>{row.supportCount}</td><td>{row.lastActionAt ? new Date(row.lastActionAt).toLocaleDateString() : "None"}</td></tr>)}</tbody></table>{!rows.length && <p className="empty-report">No learners match these filters.</p>}<div className="button-row pagination"><button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous 100</button><button className="secondary" disabled={end >= total} onClick={() => setPage(page + 1)}>Next 100</button></div></section></>;
}

function GroupSettings() {
  const { snapshot, setSnapshot } = useApp();
  const [name, setName] = useState("");
  if (!snapshot) return null;
  const activeStudents = snapshot.students.filter((student) => !student.archived);
  const assignmentByStudent = new Map(snapshot.groupAssignments.map((assignment) => [assignment.studentId, assignment.groupId]));
  const members = (group: StudentGroup) => activeStudents.filter((student) => assignmentByStudent.get(student.id) === group.id);
  const refresh = async () => {
    await dataStore.sync();
    setSnapshot(await dataStore.getSnapshot(snapshot.classRoom.id, true));
  };
  const addGroup = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    await dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/groups`, "POST", { label: name.trim() });
    setName("");
    await refresh();
  };
  return <section className="group-settings">
    <section className="card group-board-intro"><div><p className="eyebrow">WORKING GROUPS</p><h2>Group board</h2><p>Set up groups, then learners can choose their own. This board stays here so Today remains focused on teaching.</p></div><strong>{activeStudents.length - snapshot.groupAssignments.filter((assignment) => activeStudents.some((student) => student.id === assignment.studentId)).length} unassigned</strong></section>
    <form className="card group-builder" onSubmit={addGroup}><label>New group name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Table 1" /></label><button className="primary" disabled={!name.trim()}>Add group</button></form>
    {snapshot.groups.length ? <div className="teacher-group-board">{snapshot.groups.map((group) => <section className="card teacher-group" key={group.id} style={{ borderTopColor: group.color }}><div className="section-heading"><div><p className="eyebrow">{members(group).length} LEARNERS</p><h3>{group.label}</h3></div><button className="text-button danger" onClick={async () => { if (!confirm(`Remove ${group.label}? Learners will become unassigned.`)) return; await dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/groups/${group.id}`, "DELETE"); await refresh(); }}>Remove</button></div><div className="group-member-list">{members(group).map((student) => <label key={student.id}><span>{student.displayName}</span><select value={group.id} onChange={async (event) => { const next = event.target.value; if (next) await dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/groups/${next}/members/${student.id}`, "PUT"); else await dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/groups/members/${student.id}`, "DELETE"); await refresh(); }}><option value="">Unassigned</option>{snapshot.groups.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>)}{!members(group).length && <p className="empty-note">No learners have selected this group yet.</p>}</div></section>)}</div> : <section className="card empty-report"><h2>Start with a group</h2><p>Add groups such as tables, teams, or stations. Learners will see them in their Groups tab.</p></section>}
    <section className="card unassigned-learners"><div className="section-heading"><h3>Unassigned learners</h3><strong>{activeStudents.filter((student) => !assignmentByStudent.has(student.id)).length}</strong></div>{activeStudents.filter((student) => !assignmentByStudent.has(student.id)).map((student) => <label key={student.id}><span>{student.displayName}</span><select value="" onChange={async (event) => { if (!event.target.value) return; await dataStore.mutate(snapshot.classRoom.id, `/classes/${snapshot.classRoom.id}/groups/${event.target.value}/members/${student.id}`, "PUT"); await refresh(); }}><option value="">Assign to group</option>{snapshot.groups.map((group) => <option value={group.id} key={group.id}>{group.label}</option>)}</select></label>)}</section>
  </section>;
}

function Insights({ report, students, onSelect }: { report: ClassReport; students: ReportStudent[]; onSelect: (id: string) => void }) {
  const [sort, setSort] = useState<InsightSort>("name");
  const [direction, setDirection] = useState<SortDirection>("ascending");
  const changeSort = (nextSort: InsightSort) => {
    if (nextSort === sort) setDirection(direction === "ascending" ? "descending" : "ascending");
    else { setSort(nextSort); setDirection(nextSort === "name" ? "ascending" : "descending"); }
  };
  const rows = useMemo(() => [...students].sort((a, b) => {
    const result = sort === "name" ? a.displayName.localeCompare(b.displayName)
      : sort === "participation" ? a.participatedPeriods - b.participatedPeriods || a.participationEligiblePeriods - b.participationEligiblePeriods
      : (a.lastActionAt ? Date.parse(a.lastActionAt) : 0) - (b.lastActionAt ? Date.parse(b.lastActionAt) : 0);
    return direction === "ascending" ? result : -result;
  }), [direction, sort, students]);
  const leafSkills = report.skills.filter((skill) => !skill.isParent);
  const supportSkills = [...leafSkills].sort((a, b) => (b.supportCount ?? 0) - (a.supportCount ?? 0)).filter((skill) => (skill.supportCount ?? 0) > 0);
  return <>
    <section className="insight-actions card"><div><p className="eyebrow">LEARNER EVIDENCE</p><h2>Full learner roster</h2></div><p className="report-note">Select a column heading to sort.</p></section>
    <section className="matrix-wrap card"><table className="report-table insight-roster"><caption>Learner evidence for the selected class days</caption><thead><tr><SortableHeader label="Learner" active={sort === "name"} direction={direction} onClick={() => changeSort("name")}/><SortableHeader label="Positive Action days" active={sort === "participation"} direction={direction} onClick={() => changeSort("participation")}/><SortableHeader label="Last action" active={sort === "lastAction"} direction={direction} onClick={() => changeSort("lastAction")}/><th scope="col">Skills requiring support</th></tr></thead><tbody>{rows.map((student) => { const supportSkills = report.skills.filter((skill) => !skill.isParent && skill.achievements?.some((item) => item.studentId === student.studentId && item.requiresSupport)).map((skill) => skill.label); return <tr key={student.studentId}><th scope="row"><button onClick={() => onSelect(student.studentId)}>{student.displayName}</button></th><td><strong>{student.participatedPeriods}/{student.participationEligiblePeriods}</strong></td><td>{student.lastActionAt ? new Date(student.lastActionAt).toLocaleString() : "No action in range"}</td><td className="support-skills-cell">{supportSkills.length ? supportSkills.join(", ") : "None"}</td></tr>; })}</tbody></table>{rows.length === 0 && <p className="empty-report">No learners match these filters.</p>}</section>
    <div className="optional-insights">
      <details className="card report-section"><summary>Absence counts</summary><p><strong>{students.reduce((sum, student) => sum + student.absences, 0)}</strong> absences across the selected <strong>{report.periods.length}</strong> class day{report.periods.length === 1 ? "" : "s"}.</p>{students.filter((student) => student.absences > 0).map((student) => <p key={student.studentId}>{student.displayName}: {student.absences}/{student.enrolledPeriods} class days absent</p>)}</details>
      <details className="card report-section"><summary>Skills needing support</summary>{supportSkills.map((skill) => <p key={skill.id}><strong>{skill.label}</strong>: ◆ {skill.supportCount} learners</p>)}{supportSkills.length === 0 && <p>No teacher support flags in this range.</p>}</details>
      <details className="card report-section"><summary>Recent changes</summary><p>{report.masteryEvents.length} achievement changes in the selected class-day range.</p>{achievementOptions.map((option) => <p key={option.value}>{option.symbol} {option.label}: {report.masteryEvents.filter((event) => event.achievement === option.value).length}</p>)}</details>
    </div>
  </>;
}

function SortableHeader({ label, active, direction, onClick }: { label: string; active: boolean; direction: SortDirection; onClick: () => void }) {
  return <th scope="col" aria-sort={active ? direction : "none"}><button className="sortable-header" onClick={onClick}>{label}<span aria-hidden="true">{active ? direction === "ascending" ? " ▲" : " ▼" : " ↕"}</span></button></th>;
}

function Participation({ report, students, onSelect }: { report: ClassReport; students: ReportStudent[]; onSelect: (id: string) => void }) {
  const ordered = useMemo(() => [...students].sort((a, b) => a.participatedPeriods - b.participatedPeriods || a.displayName.localeCompare(b.displayName)), [students]);
  return <section className="matrix-wrap card"><table className="report-table"><caption>Participation and attendance counts for every filtered learner</caption><thead><tr><th scope="col">Learner</th><th scope="col">Present</th><th scope="col">Absences</th><th scope="col">Eligible class days</th><th scope="col">Positive Action days</th><th scope="col">Last action</th><th scope="col">Positive Actions</th><th scope="col">Redirects</th></tr></thead><tbody>{ordered.map((student) => <tr key={student.studentId}><th scope="row"><button onClick={() => onSelect(student.studentId)}>{student.displayName}</button></th><td>{student.attendedClassDays}</td><td>{student.absences}</td><td>{student.participationEligiblePeriods}</td><td><strong>{student.participatedPeriods}/{student.participationEligiblePeriods}</strong></td><td>{student.lastActionAt ? new Date(student.lastActionAt).toLocaleString() : "No action in range"}</td><td>{student.positives}</td><td>{student.redirects}</td></tr>)}</tbody></table></section>;
}

function Skills({ report, students }: { report: ClassReport; students: ReportStudent[] }) {
  const [skillId, setSkillId] = useState<string>();
  const parents = useMemo(() => report.skills.filter((skill) => skill.isParent), [report.skills]);
  const standalone = useMemo(() => report.skills.filter((skill) => !skill.isParent && !skill.parentSkillId), [report.skills]);
  const summaryMaps = useMemo(() => new Map(parents.map((skill) => [skill.id, new Map(skill.summaries?.map((row) => [row.studentId, row.summary]))])), [parents]);
  const achievementMaps = useMemo(() => new Map(standalone.map((skill) => [skill.id, new Map(skill.achievements?.map((row) => [row.studentId, row]))])), [standalone]);
  const selected = report.skills.find((skill) => skill.id === skillId);
  return <><section className="card report-section report-explainer"><strong>Evidence through {new Date(report.asOf).toLocaleString()}</strong><p>{report.historicalMasteryReconstructable ? "Counts and changes are reconstructed from evidence in the selected class-day range." : "Older change history is unavailable. Skill insights show current saved achievement and recorded changes in this range."} Teacher support markers are never shown to learners.</p></section><div className="skills-report">{report.skills.filter((skill) => !skill.isParent).map((skill) => <SkillCard skill={skill} onOpen={() => setSkillId(skill.id)} key={skill.id}/>)}</div>{selected && <SkillDetail skill={selected} report={report} onClose={() => setSkillId(undefined)}/>}</>;
}

function ParentCounts({ summary }: { summary?: ParentSummary }) { return <span className="parent-counts"><b>Evidence {summary?.evidenceCount ?? 0}/{summary?.total ?? 0}</b><span>Meet/exceed {summary?.meetOrExceedCount ?? 0}/{summary?.total ?? 0}</span>{Boolean(summary?.requiresSupportCount) && <em>◆ {summary?.requiresSupportCount} support</em>}</span>; }
function SkillCard({ skill, onOpen }: { skill: ReportSkill; onOpen: () => void }) { const distribution = skill.distribution; if (!distribution) return null; return <section className="card report-section"><div className="section-heading"><div><p className="eyebrow">{skill.category || "SKILL"}</p><h2>{skill.label}</h2></div><button className="secondary" onClick={onOpen}>Details</button></div><div className="achievement-counts">{achievementOptions.map((option) => <span key={option.value}>{option.symbol} {option.label} <b>{distribution[option.value]}</b></span>)}<span>◆ Support <b>{skill.supportCount ?? 0}</b></span></div><p className="trend-note">Changes in range: {achievementOptions.map((option) => `${option.label} ${skill.trends?.[option.value] ?? 0}`).join(" · ")} · Support flags {skill.trends?.requiresSupport ?? 0}</p></section>; }
function SkillDetail({ skill, report, onClose }: { skill: ReportSkill; report: ClassReport; onClose: () => void }) { const names = new Map(report.students.map((student) => [student.studentId, student.displayName])); const children = report.skills.filter((item) => item.parentSkillId === skill.id); const detailSkills = skill.isParent ? children : [skill]; return <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="skill-detail-title"><button className="drawer-close" onClick={onClose}>Close</button><p className="eyebrow">SKILL DETAIL</p><h2 id="skill-detail-title">{skill.label}</h2><p>All four achievements and support names are teacher-only.</p>{detailSkills.map((item) => <section className="drawer-section" key={item.id}><h3>{item.label}</h3>{achievementOptions.map((option) => { const learners = item.achievements?.filter((row) => row.achievement === option.value).map((row) => names.get(row.studentId)).filter((name): name is string => Boolean(name)) ?? []; return <details key={option.value}><summary>{option.symbol} {option.label} ({learners.length})</summary>{learners.map((name) => <p key={name}>{name}</p>)}</details>; })}<details><summary>◆ Requires support ({item.supportCount ?? 0})</summary>{item.achievements?.filter((row) => row.requiresSupport).map((row) => <p key={row.studentId}>{names.get(row.studentId)}</p>)}</details><p className="trend-note">Selected range: {achievementOptions.map((option) => `${option.label} ${item.trends?.[option.value] ?? 0}`).join(" · ")}</p></section>)}</aside>; }

function StudentEvidence({ classId, student, report, snapshot, onRefresh, onClose }: { classId: string; student: ReportStudent; report: ClassReport; snapshot: Snapshot; onRefresh: () => Promise<void>; onClose: () => void }) {
  const [photos, setPhotos] = useState<SkillPhoto[]>([]);
  const [actions, setActions] = useState<ParticipationAction[]>([]);
  const [actionMessage, setActionMessage] = useState("");
  const [deletingAction, setDeletingAction] = useState<ParticipationAction>();
  useEffect(() => { let current = true; void dataStore.getSkillPhotos(classId, student.studentId).then((value) => { if (current) setPhotos(value); }); return () => { current = false; }; }, [classId, student.studentId]);
  const actionQuery = useMemo(() => { const query = new URLSearchParams({ studentId: student.studentId }); const first = report.periods.at(-1); if (first) query.set("from", first.startedAt); query.set("to", report.asOf); return query.toString(); }, [report.asOf, report.periods, student.studentId]);
  const loadActions = () => dataStore.getParticipationActions(classId, actionQuery).then(setActions);
  useEffect(() => { void loadActions(); }, [classId, actionQuery]);
  const changeAction = async (action: ParticipationAction, type?: "part+" | "part-") => {
    try {
      if (type) await dataStore.updateParticipationAction(classId, action.id, type); else await dataStore.deleteParticipationAction(classId, action.id);
      await Promise.all([loadActions(), onRefresh()]);
      setActionMessage(type ? "Participation action corrected." : "Participation action deleted.");
    } catch (error) { setActionMessage(error instanceof Error ? error.message : "The action could not be changed."); }
  };
  const rangePhotos = useMemo(() => {
    if (report.filters.range === "all") return photos;
    const periodIds = new Set(report.periods.map((period) => period.id));
    const start = report.periods.at(-1)?.startedAt;
    return photos.filter((photo) => photo.periodId ? periodIds.has(photo.periodId) : (!start || photo.assessedAt >= start) && photo.assessedAt <= report.asOf);
  }, [photos, report.asOf, report.filters.range, report.periods]);
  const attendance = useMemo(() => new Map(snapshot.attendance.filter((item) => item.studentId === student.studentId).map((item) => [item.periodId, item.status])), [snapshot.attendance, student.studentId]);
  const eventCounts = useMemo(() => { const map = new Map<string, { positives: number; redirects: number }>(); for (const event of snapshot.events) if (event.studentId === student.studentId) { const row = map.get(event.periodId) ?? { positives: 0, redirects: 0 }; event.type === "part+" ? row.positives++ : event.type === "part-" ? row.redirects++ : undefined; map.set(event.periodId, row); } return map; }, [snapshot.events, student.studentId]);
  const parentSkills = report.skills.filter((skill) => skill.isParent);
  const timelineStatus = (period: Period) => period.startedAt < student.enrolledAt || Boolean(student.archivedAt && period.startedAt > student.archivedAt)
    ? "-"
    : attendance.get(period.id) === "absent" ? "A" : "P";
  const actionTimeline = <><h3>Participation actions</h3>{actionMessage && <p className="status-note" role="status">{actionMessage}</p>}{actions.map((action) => <div className="detail-row participation-action" key={action.id}><span><strong>{action.type === "part+" ? "Positive Action" : "Redirect"}</strong><small>{action.classDayLabel} · {new Date(action.timestamp).toLocaleString()}</small></span><span className="button-row"><button className="secondary" onClick={() => void changeAction(action, action.type === "part+" ? "part-" : "part+")}>Edit to {action.type === "part+" ? "Redirect" : "Positive Action"}</button><button className="text-button danger" onClick={() => setDeletingAction(action)}>Delete</button></span></div>)}{!actions.length && <p>No participation actions in this range.</p>}{deletingAction && <div className="modal-backdrop"><section className="card modal" role="alertdialog" aria-modal="true"><h2>Delete participation action?</h2><p>Delete this {deletingAction.type === "part+" ? "Positive Action" : "Redirect"} from <strong>{deletingAction.classDayLabel}</strong> at {new Date(deletingAction.timestamp).toLocaleTimeString()}?</p><div className="button-row"><button className="secondary" onClick={() => setDeletingAction(undefined)}>Cancel</button><button className="danger-button" onClick={async () => { await changeAction(deletingAction); setDeletingAction(undefined); }}>Delete action</button></div></section></div>}</>;
  return <aside className="drawer evidence-drawer" role="dialog" aria-modal="true" aria-labelledby="evidence-title"><button className="drawer-close" onClick={onClose}>Close</button><p className="eyebrow">TEACHER-ONLY STUDENT EVIDENCE</p><h2 id="evidence-title">{student.displayName}</h2><div className="evidence-summary-grid"><span><b>{student.participatedPeriods}/{student.participationEligiblePeriods}</b>Positive Action days</span><span><b>{student.positives}</b>Positive Actions</span><span><b>{student.redirects}</b>Redirects</span><span><b>{student.absences}</b>Absences</span><span><b>{student.masteryHistory.length}</b>Achievement changes</span><span><b>{rangePhotos.length}</b>Teacher photos</span></div><h3>Parent skill counts</h3>{parentSkills.map((skill) => <div className="detail-row" key={skill.id}><strong>{skill.label}</strong><ParentCounts summary={skill.summaries?.find((row) => row.studentId === student.studentId)?.summary}/></div>)}<h3>Class-day timeline</h3>{report.periods.map((period) => { const events = eventCounts.get(period.id) ?? { positives: 0, redirects: 0 }; return <div className="evidence-period" key={period.id}><div><strong>{period.label}</strong><small>{new Date(period.startedAt).toLocaleDateString()}</small></div><span>{timelineStatus(period)}</span><span>+ {events.positives}</span><span>↪ {events.redirects}</span></div>; })}<h3>Achievement history</h3>{student.masteryHistory.map((event) => <div className="detail-row" key={event.id}><span><strong>{event.skillLabel}</strong><small>{new Date(event.timestamp).toLocaleString()}</small>{event.requiresSupport && <em>◆ Requires support</em>}</span><span>{achievementDisplay(event.previousAchievement).symbol} {achievementDisplay(event.previousAchievement).label} → {achievementDisplay(event.achievement).symbol} {achievementDisplay(event.achievement).label}</span></div>)}{student.masteryHistory.length === 0 && <p>No achievement changes in this range.</p>}<h3>Teacher photo evidence</h3><p className="report-note">Sensitive teacher-only evidence. Photos are filtered to this learner and selected range.</p><div className="evidence-gallery">{rangePhotos.map((photo) => <figure key={photo.id}><a href={photo.imageUrl} target="_blank" rel="noreferrer"><img src={photo.imageUrl} alt={`Work evidence from ${new Date(photo.assessedAt).toLocaleDateString()}`} loading="lazy"/></a><figcaption>{new Date(photo.assessedAt).toLocaleDateString()}</figcaption></figure>)}</div>{rangePhotos.length === 0 && <p>No teacher photos for this learner in this range.</p>}</aside>;
}
function Equity({ report }: { report: ClassReport }) { return <section className="card report-section"><p className="eyebrow">TEACHER-DEFINED TAG REFLECTION</p><h2>Attention counts</h2><p className="report-note">Reflective evidence only, not proof of bias, ability, or causation.</p><div className="matrix-wrap"><table className="report-table"><caption>Actions by teacher-defined tag</caption><thead><tr><th scope="col">Tag</th><th scope="col">Learners</th><th scope="col">Positive Actions</th><th scope="col">Redirects</th></tr></thead><tbody>{report.equity.map((item) => <tr key={item.tag}><th scope="row">{item.tag}</th><td>{item.students}</td><td>{item.positives}</td><td>{item.redirects}</td></tr>)}</tbody></table></div>{report.equity.length === 0 && <p>Create and assign teacher tags in Classes to use this reflection.</p>}</section>; }
