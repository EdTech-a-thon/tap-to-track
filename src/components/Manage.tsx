import { useEffect, useState, type FormEvent } from "react";
import Papa from "papaparse";
import QRCode from "qrcode";
import { dataStore } from "../data";
import { useApp } from "../state";
import type { Skill } from "../types";
import { ClassCalendar } from "./ClassCalendar";
import { ClassSettings, Roster as ClassRoster, StudentAccess } from "./ClassAreas";
import { Groups } from "./Groups";

type ManageTab = "calendar" | "roster" | "skills" | "groups" | "access" | "settings";

export function Manage() {
  const { snapshot, setSnapshot } = useApp();
  const [tab, setTab] = useState<ManageTab>("calendar");
  if (!snapshot) return null;
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CLASS SETUP</p>
          <h1>{snapshot.classRoom.name}</h1>
        </div>
      </div>
      <div className="subnav" role="tablist">
        {(["calendar", "roster", "skills", "groups", "access", "settings"] as ManageTab[]).map(
          (item) => (
            <button
              role="tab"
              aria-selected={tab === item}
              className={tab === item ? "active" : ""}
              onClick={() => setTab(item)}
              key={item}
            >
              {item === "roster" ? "Roster & seating" : item === "skills" ? "Skills checklist" : item === "access" ? "Student access" : item}
            </button>
          ),
        )}
      </div>
      {tab === "calendar" && <ClassCalendar embedded />}
      {tab === "roster" && <ClassRoster />}
       {tab === "skills" && <Skills />}
       {tab === "groups" && <Groups />}
      {tab === "access" && <StudentAccess />}
      {tab === "settings" && <ClassSettings />}
    </section>
  );

  async function update(body: Record<string, unknown>) {
    if (body.settings)
      setSnapshot(
        await dataStore.mutate(
          snapshot!.classRoom.id,
          `/classes/${snapshot!.classRoom.id}/settings`,
          "PUT",
          body.settings,
        ),
      );
    else
      setSnapshot(
        await dataStore.mutate(
          snapshot!.classRoom.id,
          `/classes/${snapshot!.classRoom.id}`,
          "PATCH",
          body,
        ),
      );
  }
  function Settings() {
    const settings = snapshot!.classRoom.settings;
    const joinLink = `${location.origin}/join/${snapshot!.classRoom.joinCode}`;
    const [qrCode, setQrCode] = useState("");
    const [copied, setCopied] = useState(false);
    useEffect(() => { void QRCode.toDataURL(joinLink, { width: 220, margin: 1, color: { dark: "#173f35", light: "#fffdf7" } }).then(setQrCode); }, [joinLink]);
    return (
      <div className="settings-grid">
        <section className="card form-card">
          <h2>Class details</h2>
          <label>
            Class name
            <input
              defaultValue={snapshot!.classRoom.name}
              onBlur={(event) => update({ name: event.target.value })}
            />
          </label>
          <label>
            Join code
            <input value={snapshot!.classRoom.joinCode} readOnly />
            <small>Share only with learners in this class.</small>
          </label>
          <section className="student-join-card">
            <div><p className="eyebrow">STUDENT APP</p><h3>Class link</h3><a href={joinLink} target="_blank" rel="noreferrer">{joinLink}</a></div>
            <div className="button-row"><button className="primary" type="button" onClick={async () => { await navigator.clipboard.writeText(joinLink); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }}>{copied ? "Copied" : "Copy class link"}</button><a className="secondary" href={joinLink} target="_blank" rel="noreferrer">Preview student app</a></div>
            {qrCode && <img className="join-qr" src={qrCode} alt={`QR code for the ${snapshot!.classRoom.name} student app`}/>} 
            <p>Students open this link, then tap their teacher-chosen display name. No student account is required.</p>
          </section>
        </section>
        <Taxonomy />
      </div>
    );
  }
}

function Roster() {
  const { snapshot, setSnapshot } = useApp();
  const [names, setNames] = useState("");
  const [preview, setPreview] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  if (!snapshot) return null;
  const parse = (value: string) =>
    setPreview(
      value
        .split(/\r?\n|,/)
        .map((name) => name.trim())
        .filter(Boolean),
    );
  const upload = (file?: File) =>
    file &&
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) =>
        setPreview(
          data
            .map(
              (row) =>
                row.name ||
                row.Name ||
                row.displayName ||
                Object.values(row)[0],
            )
            .filter(Boolean),
        ),
    });
  const add = async () => {
    if (adding || !preview.length) return;
    setAdding(true);
    try {
      await dataStore.mutate(
        snapshot.classRoom.id,
        `/classes/${snapshot.classRoom.id}/roster`,
        "POST",
        {
          importId: crypto.randomUUID(),
          students: preview.map((displayName) => ({ displayName })),
        },
      );
      setSnapshot(await dataStore.getSnapshot(snapshot.classRoom.id, true));
      setNames("");
      setPreview([]);
    } finally {
      setAdding(false);
    }
  };
  return (
    <div className="manage-split">
      <section className="card form-card">
        <h2>Add learners</h2>
        <p>
          Paste one name per line, or upload a CSV. We only need display names.
          Avoid student IDs, emails, birth dates, or other private information.
        </p>
        <label>
          Display names
          <textarea
            rows={8}
            value={names}
            onChange={(event) => {
              setNames(event.target.value);
              parse(event.target.value);
            }}
            placeholder={"Avery R.\nJordan K.\nSam P."}
          />
        </label>
        <div className="button-row">
          <label className="secondary file-button">
            Choose CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => upload(event.target.files?.[0])}
            />
          </label>
          <a
            className="text-button"
            href="data:text/csv;charset=utf-8,name%0AAvery%20R.%0AJordan%20K."
            download="roster-template.csv"
          >
            Download template
          </a>
        </div>
      </section>
      <section className="card form-card">
        <div className="section-heading">
          <h2>Preview</h2>
          <span>{preview.length || snapshot.students.length} learners</span>
        </div>
        {preview.length ? (
          <>
            <ul className="preview-list">
              {preview.map((name, i) => (
                <li key={`${name}-${i}`}>
                  <span className="avatar mini">{name[0]}</span>
                  {name}
                </li>
              ))}
            </ul>
            <button className="primary" disabled={adding} onClick={add}>
              {adding ? "Adding learners..." : `Add ${preview.length} learners`}
            </button>
          </>
        ) : (
          <ul className="preview-list">
            {snapshot.students.map((student) => (
              <li key={student.id}>
                <span className="avatar mini">{student.displayName[0]}</span>
                {student.displayName}
                <small>{student.tags.join(", ") || "No tags"}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Skills() {
  const { snapshot, setSnapshot, classes } = useApp();
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("General");
  const [parentSkillId, setParentSkillId] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Skill>();
  const [deleting, setDeleting] = useState<Skill>();
  const [renamingCategory, setRenamingCategory] = useState("");
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneTarget, setCloneTarget] = useState("");
  const [cloneMode, setCloneMode] = useState<"merge" | "replace">("merge");
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [cloneResult, setCloneResult] = useState("");
  if (!snapshot) return null;
  const add = async (event: FormEvent) => {
    event.preventDefault();
    const skillLabel = label.trim();
    if (!skillLabel || adding) return;
    setAdding(true);
    try {
      await dataStore.mutate(
        snapshot.classRoom.id,
        `/classes/${snapshot.classRoom.id}/skills`,
        "POST",
        {
          label: skillLabel,
          category,
          parentSkillId: parentSkillId || undefined,
        },
      );
      await dataStore.sync();
      setSnapshot(await dataStore.getSnapshot(snapshot.classRoom.id, true));
      setLabel("");
    } finally {
      setAdding(false);
    }
  };
  const edit = (id: string, body: unknown) =>
    dataStore
      .mutate(
        snapshot.classRoom.id,
        `/classes/${snapshot.classRoom.id}/skills/${id}`,
        "PATCH",
        body,
      )
      .then(setSnapshot);
  const parents = snapshot.skills.filter((skill) => !skill.parentSkillId);
  const categories = Array.from(
    new Set(parents.map((skill) => skill.category || "General")),
  );
  const orderedFamilies = parents.flatMap((parent) => [
    parent,
    ...snapshot.skills.filter((skill) => skill.parentSkillId === parent.id),
  ]);
  const move = async (skill: Skill, direction: -1 | 1) => {
    let next = orderedFamilies;
    if (skill.parentSkillId) {
      const parent = parents.find((item) => item.id === skill.parentSkillId)!;
      const children = snapshot.skills.filter(
        (item) => item.parentSkillId === parent.id,
      );
      const index = children.findIndex((item) => item.id === skill.id);
      if (!children[index + direction]) return;
      [children[index], children[index + direction]] = [
        children[index + direction],
        children[index],
      ];
      next = orderedFamilies.map(
        (item) => children.find((child) => child.id === item.id) ?? item,
      );
      const childSlots = next
        .map((item, index) => (item.parentSkillId === parent.id ? index : -1))
        .filter((index) => index >= 0);
      children.forEach((child, index) => {
        next[childSlots[index]] = child;
      });
    } else {
      const index = parents.findIndex((item) => item.id === skill.id);
      if (!parents[index + direction]) return;
      const reordered = [...parents];
      [reordered[index], reordered[index + direction]] = [
        reordered[index + direction],
        reordered[index],
      ];
      next = reordered.flatMap((parent) => [
        parent,
        ...snapshot.skills.filter((item) => item.parentSkillId === parent.id),
      ]);
    }
    setSnapshot(
      await dataStore.reorderSkills(
        snapshot.classRoom.id,
        next.map((item) => item.id),
      ),
    );
  };
  return (
    <section className="card form-card wide">
      <div className="section-heading">
        <div>
          <h2>Skills checklist</h2>
          <p>
            Categories organize the checklist. A skill family summarizes achievement
              counts from its subskills, including evidence, meeting or exceeding,
            not started, and support-needed counts.
          </p>
        </div>
        <div className="button-row">
          <button className="secondary" onClick={() => setCloneOpen(true)}>
            Clone to class
          </button>
        </div>
      </div>
      <form className="skill-builder" onSubmit={add}>
        <label>
          {parentSkillId ? "Subskill" : "Skill"}
          <input
            value={label}
            disabled={adding}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={
              parentSkillId
                ? "e.g. Threads the machine"
                : "e.g. Operates a sewing machine"
            }
          />
        </label>
        <label>
          Category
          <input
            value={category}
            list="skill-categories"
            onChange={(event) => setCategory(event.target.value)}
            placeholder="e.g. Machine skills"
          />
          <datalist id="skill-categories">
            {categories.map((item) => (
              <option value={item} key={item} />
            ))}
          </datalist>
        </label>
        <label>
          Contributes to
          <select
            value={parentSkillId}
            onChange={(event) => {
              setParentSkillId(event.target.value);
              const parent = parents.find(
                (item) => item.id === event.target.value,
              );
              if (parent) setCategory(parent.category);
            }}
          >
            <option value="">Top-level skill</option>
            {parents.map((skill) => (
              <option value={skill.id} key={skill.id}>
                {skill.label}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={adding || !label.trim()}>
          {adding ? "Adding..." : parentSkillId ? "Add subskill" : "Add skill"}
        </button>
      </form>
      <div className="skill-list">
        {categories.map((group) => (
          <section className="skill-category" key={group}>
            <div className="category-heading">
              <h3>{group}</h3>
              <button
                className="text-button"
                onClick={() => setRenamingCategory(group)}
              >
                Rename
              </button>
            </div>
            {parents
              .filter((skill) => (skill.category || "General") === group)
              .map((skill) => (
                <SkillEditor
                  key={skill.id}
                  skill={skill}
                  children={snapshot.skills.filter(
                    (child) => child.parentSkillId === skill.id,
                  )}
                  edit={edit}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                  onMove={move}
                  addChild={() => {
                    setParentSkillId(skill.id);
                    setCategory(skill.category || "General");
                    setLabel("");
                  }}
                />
              ))}
          </section>
        ))}
      </div>
      {editing && (
        <SkillEditDialog
          skill={editing}
          onClose={() => setEditing(undefined)}
          onSave={async (body) => {
            await edit(editing.id, body);
            await dataStore.sync();
            setSnapshot(
              await dataStore.getSnapshot(snapshot.classRoom.id, true),
            );
            setEditing(undefined);
          }}
        />
      )}
      {renamingCategory && (
        <CategoryDialog
          category={renamingCategory}
          onClose={() => setRenamingCategory("")}
          onSave={async (name) => {
            for (const parent of parents.filter(
              (item) => (item.category || "General") === renamingCategory,
            )) {
              await edit(parent.id, { category: name });
              await dataStore.sync();
            }
            setSnapshot(
              await dataStore.getSnapshot(snapshot.classRoom.id, true),
            );
            setRenamingCategory("");
          }}
        />
      )}
      {deleting && (
        <DeleteSkillDialog
          skill={deleting}
          children={snapshot.skills.filter(
            (item) => item.parentSkillId === deleting.id,
          )}
          onClose={() => setDeleting(undefined)}
          onDelete={async () => {
            await dataStore.mutate(
              snapshot.classRoom.id,
              `/classes/${snapshot.classRoom.id}/skills/${deleting.id}`,
              "DELETE",
            );
            await dataStore.sync();
            setSnapshot(
              await dataStore.getSnapshot(snapshot.classRoom.id, true),
            );
            setDeleting(undefined);
          }}
        />
      )}
      {cloneOpen && (
        <div className="modal-backdrop">
          <section className="card modal" role="dialog" aria-modal="true">
            <h2>Clone this checklist</h2>
            <label>
              Destination class
              <select
                value={cloneTarget}
                onChange={(event) => setCloneTarget(event.target.value)}
              >
                <option value="">Choose a class</option>
                {classes
                  .filter((room) => room.id !== snapshot.classRoom.id)
                  .map((room) => (
                    <option value={room.id} key={room.id}>
                      {room.name}
                    </option>
                  ))}
              </select>
            </label>
            <fieldset>
              <legend>How to combine skills</legend>
              <label>
                <input
                  type="radio"
                  checked={cloneMode === "merge"}
                  onChange={() => {
                    setCloneMode("merge");
                    setReplaceConfirmed(false);
                  }}
                />{" "}
                Merge and skip matching skills
              </label>
              <label>
                <input
                  type="radio"
                  checked={cloneMode === "replace"}
                  onChange={() => setCloneMode("replace")}
                />{" "}
                Replace the destination checklist
              </label>
            </fieldset>
            {cloneMode === "replace" && (
              <label className="danger-confirm">
                <input
                  type="checkbox"
                  checked={replaceConfirmed}
                  onChange={(event) =>
                    setReplaceConfirmed(event.target.checked)
                  }
                />{" "}
                I understand this removes current achievement records in the destination.
                Historical evidence keeps its original labels.
              </label>
            )}
            {cloneResult && <p className="success-note">{cloneResult}</p>}
            <div className="button-row">
              <button
                className="secondary"
                onClick={() => {
                  setCloneOpen(false);
                  setCloneResult("");
                }}
              >
                Close
              </button>
              <button
                className="primary"
                disabled={
                  !cloneTarget || (cloneMode === "replace" && !replaceConfirmed)
                }
                onClick={async () => {
                  const result = await dataStore.cloneSkills(
                    cloneTarget,
                    snapshot.classRoom.id,
                    cloneMode,
                  );
                  const room = classes.find((item) => item.id === cloneTarget);
                  setCloneResult(
                    `${room?.name}: ${result.created} created, ${result.skipped} skipped, ${result.removed} removed.`,
                  );
                  if (cloneTarget === snapshot.classRoom.id)
                    setSnapshot(
                      await dataStore.getSnapshot(snapshot.classRoom.id, true),
                    );
                }}
              >
                Clone checklist
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function SkillEditor({
  skill,
  children,
  edit,
  onEdit,
  onDelete,
  onMove,
  addChild,
}: {
  skill: Skill;
  children: Skill[];
  edit: (id: string, body: unknown) => Promise<unknown>;
  onEdit: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
  onMove: (skill: Skill, direction: -1 | 1) => void;
  addChild: () => void;
}) {
  return (
    <div className="skill-family">
      <div className="skill-row">
        <div className="move-controls">
          <button
            aria-label={`Move ${skill.label} up`}
            onClick={() => onMove(skill, -1)}
          >
            ↑
          </button>
          <button
            aria-label={`Move ${skill.label} down`}
            onClick={() => onMove(skill, 1)}
          >
            ↓
          </button>
        </div>
        <div>
          <strong>{skill.label}</strong>
          <small>
            {children.length
              ? `${children.length} subskill${children.length === 1 ? "" : "s"} contribute achievement counts`
              : "Teacher-assessed skill"}
          </small>
        </div>
        <button className="text-button" onClick={addChild}>
          + Subskill
        </button>
        <button className="text-button" onClick={() => onEdit(skill)}>
          Edit
        </button>
        <button className="text-button danger" onClick={() => onDelete(skill)}>
          Delete
        </button>
      </div>
      {children.map((child) => (
        <div className="skill-row subskill-row" key={child.id}>
          <div className="move-controls">
            <button
              aria-label={`Move ${child.label} up`}
              onClick={() => onMove(child, -1)}
            >
              ↑
            </button>
            <button
              aria-label={`Move ${child.label} down`}
              onClick={() => onMove(child, 1)}
            >
              ↓
            </button>
          </div>
          <div>
            <strong>{child.label}</strong>
            <small>Contributes to {skill.label}</small>
          </div>
          <button className="text-button" onClick={() => onEdit(child)}>
            Edit
          </button>
          <button
            className="text-button danger"
            onClick={() => onDelete(child)}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}

function SkillEditDialog({
  skill,
  onClose,
  onSave,
}: {
  skill: Skill;
  onClose: () => void;
  onSave: (body: { label: string; category: string }) => Promise<void>;
}) {
  const [label, setLabel] = useState(skill.label);
  const [category, setCategory] = useState(skill.category);
  return (
    <div className="modal-backdrop">
      <form
        className="card modal"
        onSubmit={async (event) => {
          event.preventDefault();
          await onSave({ label: label.trim(), category: category.trim() });
        }}
      >
        <h2>Edit {skill.parentSkillId ? "subskill" : "skill"}</h2>
        <label>
          Name
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            autoFocus
          />
        </label>
        <label>
          Category
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </label>
        <div className="button-row">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!label.trim()}>
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
function CategoryDialog({
  category,
  onClose,
  onSave,
}: {
  category: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(category);
  return (
    <div className="modal-backdrop">
      <form
        className="card modal"
        onSubmit={async (event) => {
          event.preventDefault();
          await onSave(name.trim());
        }}
      >
        <h2>Rename category</h2>
        <label>
          Category name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </label>
        <div className="button-row">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!name.trim()}>
            Rename
          </button>
        </div>
      </form>
    </div>
  );
}
function DeleteSkillDialog({
  skill,
  children,
  onClose,
  onDelete,
}: {
  skill: Skill;
  children: Skill[];
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="modal-backdrop">
      <section className="card modal">
        <h2>Delete {skill.label}?</h2>
        {children.length > 0 && (
          <>
            <p>This also deletes these subskills:</p>
            <ul>
              {children.map((child) => (
                <li key={child.id}>{child.label}</li>
              ))}
            </ul>
          </>
        )}
        <p className="danger-note">
          Current achievement records for this skill family will be removed. Historical
          evidence is retained with its original skill labels.
        </p>
        <label className="danger-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />{" "}
          I understand and want to delete this skill
          {children.length ? " and its subskills" : ""}.
        </label>
        <div className="button-row">
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="danger-button"
            disabled={!confirmed}
            onClick={onDelete}
          >
            Delete permanently
          </button>
        </div>
      </section>
    </div>
  );
}

function Taxonomy() {
  const { snapshot, setSnapshot } = useApp();
  if (!snapshot) return null;
  const add = async (kind: "tags" | "request-types") => {
    const label = prompt(kind === "tags" ? "Tag name" : "Request type");
    if (label)
      setSnapshot(
        await dataStore.mutate(
          snapshot.classRoom.id,
          `/classes/${snapshot.classRoom.id}/${kind}`,
          "POST",
          { label, color: "#E9A23B", behavior: "custom", resolveLabel: "Resolve" },
        ),
      );
  };
  return (
    <section className="card form-card">
      <h2>Labels & requests</h2>
      <h3>Student tags</h3>
      <div className="chips">
        {snapshot.tags.map((tag) => (
          <span key={tag.id}>{tag.label}</span>
        ))}
        <button onClick={() => add("tags")}>+ Add</button>
      </div>
      <h3>Request types</h3>
      <div className="chips">
        {snapshot.requestTypes.map((type) => (
          <span key={type.id}>{type.label}</span>
        ))}
        <button onClick={() => add("request-types")}>+ Add</button>
      </div>
    </section>
  );
}

function DataTools() {
  const { snapshot } = useApp();
  if (!snapshot) return null;
  const importJson = async (file?: File) => {
    if (!file) return;
    const response = await fetch("/api/import/json", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: await file.text(),
    });
    if (!response.ok) throw new Error("The backup could not be restored.");
    location.reload();
  };
  return (
    <section className="card form-card wide">
      <h2>Take your data with you</h2>
      <p>
        Reports include participation, attendance, skill states, and evidence.
        The JSON backup contains the class records, but photo binaries are excluded, and restores as a new class.
        Store files according to your school’s student privacy policy.
      </p>
      <div className="export-grid">
        <a
          className="secondary"
          href={`/api/classes/${snapshot.classRoom.id}/reports/export/csv?range=all`}
        >
          Download full CSV report
        </a>
        <a
          className="secondary"
          href={`/api/classes/${snapshot.classRoom.id}/reports/export/xlsx?range=all`}
        >
          Download full Excel report
        </a>
        <a
          className="secondary"
          href={`/api/classes/${snapshot.classRoom.id}/export/json`}
        >
          Download full JSON backup
        </a>
        <label className="secondary file-button">
          Restore JSON as a new class
          <input
            type="file"
            accept=".json"
            onChange={(event) => importJson(event.target.files?.[0])}
          />
        </label>
      </div>
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
