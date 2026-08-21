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
  {:else}
    <div class="setup-grid">
      <section class="panel">
        {#if store.activeClass}
          <label>Class
            <select bind:value={store.activeClassId}>
              {#each store.classes as cls}<option value={cls.id}>{cls.name}</option>{/each}
            </select>
          </label>

          <ImportRoster classId={store.activeClass.id} />

          <ul class="roster-list">
            {#each store.studentsIn(store.activeClass.id) as student (student.id)}
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
        {:else}
          <h2>Make your first class</h2>
          <p class="hint">A class is a roster that meets repeatedly — "Period 2", say.</p>
        {/if}
      </section>

      <section class="panel">
        <h2>Your classes</h2>
        <ul class="roster-list">
          {#each store.classes as cls (cls.id)}
            <li>
              <input value={cls.name} aria-label="Class name"
                onchange={(event) => store.renameClass(cls.id, event.currentTarget.value.trim())} />
              <button onclick={() => removeClass(cls.id, cls.name)}>Delete</button>
            </li>
          {/each}
        </ul>
        <label>Add a class <input bind:value={newClassName} placeholder="Period 2" /></label>
        <button class="primary" disabled={!newClassName.trim()} onclick={addClass}>Add class</button>
      </section>

      <section class="panel">
        <Behaviors />
      </section>

      {#if store.activeClass}
        <section class="panel">
          <ClassBehaviors classId={store.activeClass.id} />
        </section>
      {/if}
    </div>
  {/if}
</main>
