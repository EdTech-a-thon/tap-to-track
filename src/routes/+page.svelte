<script lang="ts">
  import { onMount } from "svelte";
  import SeatCanvas from "$lib/components/SeatCanvas.svelte";
  import SeatingMode from "$lib/components/SeatingMode.svelte";
  import TrackingMode from "$lib/components/TrackingMode.svelte";
  import UndoToast from "$lib/components/UndoToast.svelte";
  import { seatDeletionImpact } from "$lib/domain/assignment";
  import { nextSeatSpot } from "$lib/domain/seating";
  import { store } from "$lib/store.svelte";
  import { ui } from "$lib/ui.svelte";

  type Mode = "track" | "configure";
  /** Configuring the room is mostly seating students; moving desks is a step aside from that. */
  type ConfigureMode = "seating" | "layout";
  let mode: Mode = $state("track");
  let configuring: ConfigureMode = $state("seating");
  let snapping = $state(true);
  let selectedSeatId = $state<string | null>(null);

  onMount(() => store.load());

  let selectedSeat = $derived(store.seats.find((seat) => seat.id === selectedSeatId));

  function toggleConfiguring() {
    configuring = configuring === "layout" ? "seating" : "layout";
    selectedSeatId = null;
  }

  function goToLayout() {
    mode = "configure";
    configuring = "layout";
  }

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
    {#if mode === "configure" && configuring === "layout"}
      <!-- Rearranging is a room-wide job, so the tabs, the class and the chart tools all
      step out of the way until the teacher is done with the furniture. -->
      <section class="chart-bar layout-bar">
        <div class="bar-side">
          <button class="secondary" onclick={addSeat}>Add a desk</button>
          <label class="check">
            <input type="checkbox" bind:checked={snapping} />
            Line desks up
          </label>
          <button class="secondary" disabled={!selectedSeat} onclick={deleteSelected}>
            Delete desk
          </button>
        </div>

        <p class="bar-center layout-flag">Rearranging desk layout</p>

        <div class="bar-end">
          <button class="leave" onclick={toggleConfiguring}>Back to seating students</button>
        </div>
      </section>
    {:else}
      <section class="chart-bar">
        <div class="bar-side">
          {#if mode === "configure"}
            <button class="secondary mode-switch" onclick={toggleConfiguring}>
              Rearrange desk layout
            </button>
          {/if}
        </div>

        <div class="bar-center modes" role="group" aria-label="Chart mode">
          <button class:active={mode === "track"} onclick={() => (mode = "track")}>Teaching</button>
          <button class:active={mode === "configure"} onclick={() => (mode = "configure")}>
            Configure Seating
          </button>
        </div>

        <div class="bar-end"></div>
      </section>
    {/if}
  {/if}

  {#if !store.loaded}
    <p class="hint">Opening your classroom…</p>
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
  {:else if configuring === "layout"}
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
      <p>Move the desks into place first, then you can seat students in them.</p>
      <button class="primary" onclick={goToLayout}>Rearrange Desk Layout</button>
    </section>
  {:else}
    <SeatingMode classId={store.activeClass.id} />
  {/if}
</main>

<UndoToast />
