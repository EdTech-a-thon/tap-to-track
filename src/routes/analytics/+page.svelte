<script lang="ts">
  import { onMount } from "svelte";
  import { aggregate, sortRows, type SortKey, type Window } from "$lib/domain/analytics";
  import { store } from "$lib/store.svelte";

  let window: Window = $state("week");
  let behaviorIds = $state<string[]>([]);
  let classIds = $state<string[]>([]);
  let sort = $state<SortKey>({ column: "student", descending: false });
  let started = $state(false);

  onMount(async () => {
    await store.load();
    behaviorIds = store.behaviors.map((behavior) => behavior.id);
    classIds = store.classes.map((cls) => cls.id);
    started = true;
  });

  let columns = $derived(
    [...store.behaviors]
      .sort((a, b) => a.position - b.position)
      .filter((behavior) => behaviorIds.includes(behavior.id)),
  );

  let rows = $derived(sortRows(aggregate({
    taps: store.taps,
    students: store.students,
    classes: store.classes,
    behaviorIds: columns.map((behavior) => behavior.id),
    classIds,
    window,
    now: Date.now(),
  }), sort));

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  }

  function sortBy(column: string) {
    sort = sort.column === column
      ? { column, descending: !sort.descending }
      : { column, descending: column !== "student" && column !== "class" };
  }

  const windows: { value: Window; label: string }[] = [
    { value: "week", label: "Last 7 days" },
    { value: "month", label: "Last 30 days" },
    { value: "all", label: "All time" },
  ];
</script>

<main class="page">
  <section class="hero">
    <div>
      <p class="eyebrow">OVER TIME</p>
      <h1>Analytics</h1>
      <p>Every tap you've recorded, counted up.</p>
    </div>
  </section>

  {#if !store.loaded || !started}
    <p class="hint">Adding everything up…</p>
  {:else if !store.classes.length}
    <section class="empty"><span>✦</span><h2>No classes yet</h2><a class="primary" href="/setup">Go to Setup</a></section>
  {:else}
    <section class="filters panel">
      <div class="filter">
        <h2>When</h2>
        <div class="modes">
          {#each windows as option}
            <button class:active={window === option.value} onclick={() => (window = option.value)}>
              {option.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="filter">
        <h2>What</h2>
        <div class="checks">
          {#each [...store.behaviors].sort((a, b) => a.position - b.position) as behavior}
            <label class="check">
              <input type="checkbox" checked={behaviorIds.includes(behavior.id)}
                onchange={() => (behaviorIds = toggle(behaviorIds, behavior.id))} />
              <span class="swatch" style:background={behavior.color}></span>
              {behavior.name}
            </label>
          {/each}
        </div>
      </div>

      <div class="filter">
        <h2>Who</h2>
        <div class="checks">
          {#each store.classes as cls}
            <label class="check">
              <input type="checkbox" checked={classIds.includes(cls.id)}
                onchange={() => (classIds = toggle(classIds, cls.id))} />
              {cls.name}
            </label>
          {/each}
        </div>
      </div>
    </section>

    {#if !rows.length}
      <section class="empty"><span>✦</span><h2>Nobody to show</h2><p>Turn a class back on above.</p></section>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th><button onclick={() => sortBy("student")}>Student</button></th>
              <th><button onclick={() => sortBy("class")}>Class</button></th>
              {#each columns as behavior (behavior.id)}
                <th class="num">
                  <button onclick={() => sortBy(behavior.id)}>
                    <span class="swatch" style:background={behavior.color}></span>{behavior.name}
                  </button>
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.studentId)}
              <tr class:quiet={row.total === 0}>
                <td><strong>{row.studentName}</strong></td>
                <td>{row.className}</td>
                {#each columns as behavior (behavior.id)}
                  <td class="num">{row.counts[behavior.id] ?? 0}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</main>
