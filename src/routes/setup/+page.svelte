<script lang="ts">
  import { onMount } from "svelte";
  import Behaviors from "$lib/components/Behaviors.svelte";
  import ClassBehaviors from "$lib/components/ClassBehaviors.svelte";
  import ImportRoster from "$lib/components/ImportRoster.svelte";
  import { store } from "$lib/store.svelte";

  let newClassName = $state("");

  onMount(() => store.load());

  async function addClass() {
    const name = newClassName.trim();
    if (!name) return;
    store.activeClassId = await store.addClass(name);
    newClassName = "";
  }

  async function removeClass(id: string, name: string) {
    if (confirm(`Delete ${name}? Its students and their history go too.`)) await store.deleteClass(id);
  }
</script>

<main class="page">
  <section class="hero">
    <div>
      <p class="eyebrow">SETUP</p>
      <h1>Classes &amp; students</h1>
      <p>Each class is a roster that meets again and again.</p>
    </div>
  </section>

  {#if !store.loaded}
    <p class="hint">Opening your classes…</p>
  {:else if !store.classes.length}
    <section class="panel start">
      <h2>Make your first class</h2>
      <p class="hint">A class is a roster that meets repeatedly — "Period 2", say.</p>
      <label>Class name <input bind:value={newClassName} placeholder="Period 2" /></label>
      <button class="primary" disabled={!newClassName.trim()} onclick={addClass}>Add class</button>
    </section>
  {:else}
    <section class="class-rail" aria-label="Your classes">
      <div class="class-tabs">
        {#each store.classes as cls (cls.id)}
          <button class="class-tab" class:active={cls.id === store.activeClassId}
            onclick={() => (store.activeClassId = cls.id)}>{cls.name}</button>
        {/each}
      </div>
      <div class="add-class">
        <input bind:value={newClassName} placeholder="Period 2" aria-label="New class name"
          onkeydown={(event) => event.key === "Enter" && addClass()} />
        <button class="secondary" disabled={!newClassName.trim()} onclick={addClass}>Add class</button>
      </div>
    </section>

    {#if store.activeClass}
      {@const students = store.studentsIn(store.activeClass.id)}
      <div class="setup-grid">
        <section class="panel">
          <header class="panel-head">
            <label>Class name
              <input value={store.activeClass.name} aria-label="Class name"
                onchange={(event) => store.renameClass(store.activeClass!.id, event.currentTarget.value.trim())} />
            </label>
            <button class="linkish danger"
              onclick={() => removeClass(store.activeClass!.id, store.activeClass!.name)}>Delete class</button>
          </header>

          <ImportRoster classId={store.activeClass.id} />

          <h2 class="count">{students.length} student{students.length === 1 ? "" : "s"}</h2>
          <div class="roster-scroll">
            <ul class="roster-list">
              {#each students as student (student.id)}
                <li>
                  <span class="avatar small">{student.name.slice(0, 1).toUpperCase()}</span>
                  <input value={student.name} aria-label="Student name"
                    onchange={(event) => store.renameStudent(student.id, event.currentTarget.value.trim())} />
                  <button onclick={() => confirm(`Remove ${student.name}?`) && store.removeStudent(student.id)}>
                    Remove
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        </section>

        <section class="panel">
          <ClassBehaviors classId={store.activeClass.id} />
        </section>

        <section class="panel wide">
          <Behaviors />
        </section>
      </div>
    {/if}
  {/if}
</main>
