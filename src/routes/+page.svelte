<script lang="ts">
  import { onMount } from "svelte";
  import SeatCanvas from "$lib/components/SeatCanvas.svelte";
  import SeatingMode from "$lib/components/SeatingMode.svelte";
  import OutboxBadge from "$lib/components/OutboxBadge.svelte";
  import SessionBar from "$lib/components/SessionBar.svelte";
  import TrackingMode from "$lib/components/TrackingMode.svelte";
  import UndoToast from "$lib/components/UndoToast.svelte";
  import { seatDeletionImpact } from "$lib/domain/assignment";
  import { nextSeatSpot } from "$lib/domain/seating";
  import { store } from "$lib/store.svelte";
  import { enterTeaching, leaveTeaching, ui } from "$lib/ui.svelte";

  type Mode = "track" | "seating" | "layout";
  let mode: Mode = $state("track");
  let snapping = $state(true);
  let selectedSeatId = $state<string | null>(null);

  onMount(() => store.load());

  // Ending a class — or a forgotten one being auto-closed — drops out of Teaching mode.
  $effect(() => {
    if (ui.teaching && !store.openSession) leaveTeaching();
  });

  /** Starting a class is the moment the room should fill the screen. */
  async function startClass() {
    if (!store.activeClass) return;
    await store.startSession(store.activeClass.id);
    mode = "track";
    await enterTeaching();
  }

  let selectedSeat = $derived(store.seats.find((seat) => seat.id === selectedSeatId));

  function addSeat() {
    const spot = nextSeatSpot(store.seats);
    store.addSeat(spot.x, spot.y);
  }

  /** The Layout is shared, so one deletion can unseat students in several Classes. */
  function deleteSelected() {
    if (!selectedSeatId) return;
    const impact = seatDeletionImpact(store.students, selectedSeatId);
    const warning = impact.classCount
      ? `This desk is in use by ${impact.students.length} student${impact.students.length === 1 ? "" : "s"} across ${impact.classCount} class${impact.classCount === 1 ? "" : "es"}. Deleting it leaves them without a seat. Continue?`
      : "Delete this desk?";
    if (!confirm(warning)) return;
    store.deleteSeat(selectedSeatId);
    selectedSeatId = null;
  }
</script>

<main class="page chart-page">
  {#if !ui.teaching}
  <section class="chart-bar">
    <div class="modes" role="group" aria-label="Chart mode">
      <button class:active={mode === "track"} onclick={() => (mode = "track")}>Teaching</button>
      <button class:active={mode === "seating"} onclick={() => (mode = "seating")}>Seating</button>
      <button class:active={mode === "layout"} onclick={() => (mode = "layout")}>Layout</button>
    </div>

    {#if store.classes.length}
      <label class="class-picker">Class
        <select bind:value={store.activeClassId}>
          {#each store.classes as cls}<option value={cls.id}>{cls.name}</option>{/each}
        </select>
      </label>
    {/if}

    {#if mode === "layout"}
      <button class="secondary" onclick={addSeat}>Add a desk</button>
      <label class="check">
        <input type="checkbox" bind:checked={snapping} />
        Line desks up
      </label>
      <button class="secondary" disabled={!selectedSeat} onclick={deleteSelected}>
        Delete desk
      </button>
    {/if}

    <div class="bar-end">
      {#if store.openSession}
        <SessionBar />
        <button class="secondary" onclick={enterTeaching}>Full screen</button>
      {:else if store.activeClass}
        <OutboxBadge />
        <button class="primary" onclick={startClass}>Start class</button>
      {/if}
    </div>
  </section>
  {/if}

  {#if !store.loaded}
    <p class="hint">Opening your classroom…</p>
  {:else if mode === "layout"}
    {#if !store.seats.length}
      <section class="empty">
        <span>✦</span>
        <h2>Draw your room</h2>
        <p>Add a desk for each seat in your classroom, then drag them where they belong.</p>
        <button class="primary" onclick={addSeat}>Add the first desk</button>
      </section>
    {:else}
      <p class="hint">
        Drag a desk to move it. This is your room — every class you teach in it shares the
        same layout, and moving desks never changes who sits where.
      </p>
      <SeatCanvas
        {snapping}
        draggable
        selectedId={selectedSeatId}
        onSeatClick={(seat) => (selectedSeatId = seat.id === selectedSeatId ? null : seat.id)}
      />
    {/if}
  {:else if mode === "track"}
    {#if !store.activeClass}
      <section class="empty">
        <span>✦</span>
        <h2>No classes yet</h2>
        <p>Make a class and add some students before you start teaching.</p>
        <a class="primary" href="/setup">Go to Setup</a>
      </section>
    {:else}
      <TrackingMode classId={store.activeClass.id} />
    {/if}
  {:else if !store.activeClass}
    <section class="empty">
      <span>✦</span>
      <h2>No classes yet</h2>
      <p>Make a class and add some students, then come back to seat them.</p>
      <a class="primary" href="/setup">Go to Setup</a>
    </section>
  {:else if !store.seats.length}
    <section class="empty">
      <span>✦</span>
      <h2>No desks yet</h2>
      <p>Draw your room in Layout first, then you can seat students in it.</p>
      <button class="primary" onclick={() => (mode = "layout")}>Go to Layout</button>
    </section>
  {:else}
    <SeatingMode classId={store.activeClass.id} />
  {/if}
</main>

<UndoToast />
