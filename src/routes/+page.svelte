<script lang="ts">
  import { onMount } from "svelte";
  import { loadData, saveData, starterData } from "$lib/storage";
  import type { AppData, Student } from "$lib/types";

  let data: AppData = $state(starterData());
  let ready = $state(false);
  let view: "track" | "roster" = $state("track");
  let newNames = $state("");
  let className = $state("");
  let message = $state("");

  onMount(() => { data = loadData(); ready = true; });
  let activeClass = $derived(data.classes.find((room) => room.id === data.activeClassId) ?? data.classes[0]);
  let presentStudents = $derived(activeClass?.students.filter((student) => student.attendance === "present") ?? []);
  let positiveTotal = $derived(presentStudents.reduce((total, student) => total + student.positive, 0));
  let heardCount = $derived(presentStudents.filter((student) => student.positive > 0).length);

  function update(next: AppData) { data = next; saveData(data); }
  function updateStudent(id: string, change: (student: Student) => Student) {
    if (!activeClass) return;
    update({ ...data, classes: data.classes.map((room) => room.id === activeClass.id
      ? { ...room, students: room.students.map((student) => student.id === id ? change(student) : student) } : room) });
  }
  function mark(id: string, kind: "positive" | "redirect") {
    updateStudent(id, (student) => ({ ...student, [kind]: student[kind] + 1 }));
    const name = activeClass?.students.find((student) => student.id === id)?.name;
    message = `${kind === "positive" ? "Positive participation" : "Redirect"} recorded for ${name}.`;
  }
  function addStudents() {
    if (!activeClass) return;
    const names = newNames.split(/\n|,/).map((name) => name.trim()).filter(Boolean);
    if (!names.length) return;
    const additions = names.map((name) => ({ id: crypto.randomUUID(), name, attendance: "present" as const, positive: 0, redirect: 0 }));
    update({ ...data, classes: data.classes.map((room) => room.id === activeClass.id ? { ...room, students: [...room.students, ...additions] } : room) });
    newNames = "";
  }
  function addClass() {
    const name = className.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    update({ ...data, activeClassId: id, classes: [...data.classes, { id, name, students: [] }] });
    className = ""; view = "roster";
  }
  function startFreshDay() {
    if (!activeClass || !confirm("Start fresh? Attendance and tap counts will reset for this class.")) return;
    update({ ...data, day: new Date().toISOString().slice(0, 10), classes: data.classes.map((room) => room.id === activeClass.id
      ? { ...room, students: room.students.map((student) => ({ ...student, attendance: "present", positive: 0, redirect: 0 })) } : room) });
  }
</script>

<svelte:head><title>{activeClass?.name ?? "Tap-to-Track"}</title></svelte:head>

{#if !ready}
  <main class="loading">Opening your class…</main>
{:else}
  <header class="topbar">
    <a class="brand" href="/" aria-label="Tap-to-Track home"><span>T</span><strong>Tap-to-Track</strong></a>
    <label class="class-picker">Class
      <select value={data.activeClassId} onchange={(event) => update({ ...data, activeClassId: event.currentTarget.value })}>
        {#each data.classes as room}<option value={room.id}>{room.name}</option>{/each}
      </select>
    </label>
    <nav aria-label="Main sections">
      <button class:active={view === "track"} onclick={() => view = "track"}>Track</button>
      <button class:active={view === "roster"} onclick={() => view = "roster"}>Roster</button>
    </nav>
  </header>
  <main class="page">
    {#if view === "track"}
      <section class="hero">
        <div><p class="eyebrow">TODAY</p><h1>{activeClass?.name}</h1><p>Tap a learner as you teach. That’s it.</p></div>
        <button class="secondary" onclick={startFreshDay}>Start fresh</button>
      </section>
      <section class="summary" aria-label="Class summary">
        <div><strong>{presentStudents.length}</strong><span>present</span></div>
        <div><strong>{heardCount}<small> / {presentStudents.length}</small></strong><span>heard from</span></div>
        <div><strong>{positiveTotal}</strong><span>positive taps</span></div>
      </section>
      {#if !activeClass?.students.length}
        <section class="empty"><span>✦</span><h2>Add your learners</h2><p>Your class is ready. Add a few names to begin tracking.</p><button class="primary" onclick={() => view = "roster"}>Set up roster</button></section>
      {:else}
        <section class="student-grid" aria-label="Learners">
          {#each activeClass.students as student (student.id)}
            <article class:absent={student.attendance === "absent"} class="student-card">
              <div class="student-heading">
                <span class="avatar">{student.name.slice(0, 1).toUpperCase()}</span>
                <div><h2>{student.name}</h2><span>{student.attendance === "absent" ? "Absent" : student.positive ? `${student.positive} positive` : "Not heard from yet"}</span></div>
              </div>
              <div class="tap-actions">
                <button class="positive" disabled={student.attendance === "absent"} onclick={() => mark(student.id, "positive")}><strong>+</strong> Positive</button>
                <button class="redirect" disabled={student.attendance === "absent"} onclick={() => mark(student.id, "redirect")}><strong>{student.redirect}</strong> Redirect</button>
              </div>
              <button class="attendance" onclick={() => updateStudent(student.id, (item) => ({ ...item, attendance: item.attendance === "present" ? "absent" : "present" }))}>Mark {student.attendance === "present" ? "absent" : "present"}</button>
            </article>
          {/each}
        </section>
      {/if}
    {:else}
      <section class="hero"><div><p class="eyebrow">SETUP</p><h1>Classes & learners</h1><p>Keep only the names you need for quick classroom taps.</p></div></section>
      <div class="setup-grid">
        <section class="panel">
          <h2>{activeClass?.name} roster</h2>
          <label>Add names <small>One per line, or separated by commas</small><textarea bind:value={newNames} rows="5" placeholder="Avery&#10;Jordan&#10;Kai"></textarea></label>
          <button class="primary" disabled={!newNames.trim()} onclick={addStudents}>Add learners</button>
          <ul class="roster-list">
            {#each activeClass?.students ?? [] as student (student.id)}
              <li><span class="avatar small">{student.name.slice(0, 1).toUpperCase()}</span><strong>{student.name}</strong><button onclick={() => {
                if (confirm(`Remove ${student.name}?`)) update({ ...data, classes: data.classes.map((room) => room.id === activeClass?.id ? { ...room, students: room.students.filter((item) => item.id !== student.id) } : room) });
              }}>Remove</button></li>
            {/each}
          </ul>
        </section>
        <section class="panel">
          <h2>Add another class</h2>
          <label>Class name <input bind:value={className} placeholder="Period 2" /></label>
          <button class="primary" disabled={!className.trim()} onclick={addClass}>Add class</button>
        </section>
      </div>
    {/if}
  </main>
  {#if message}<div class="toast" role="status">{message}<button aria-label="Dismiss" onclick={() => message = ""}>×</button></div>{/if}
{/if}
