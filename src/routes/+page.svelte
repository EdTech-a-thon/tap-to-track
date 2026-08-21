<script lang="ts">
  import { onMount } from "svelte";
  import SeatCanvas from "$lib/components/SeatCanvas.svelte";
  import { nextSeatSpot } from "$lib/domain/seating";
  import { store } from "$lib/store.svelte";

  type Mode = "layout" | "assign";
  let mode: Mode = $state("layout");
  let snapping = $state(true);
  let selectedSeatId = $state<string | null>(null);

  onMount(() => store.load());

  let selectedSeat = $derived(store.seats.find((seat) => seat.id === selectedSeatId));

  function addSeat() {
    const spot = nextSeatSpot(store.seats);
    store.addSeat(spot.x, spot.y);
  }

  function deleteSelected() {
    if (!selectedSeatId) return;
    store.deleteSeat(selectedSeatId);
    selectedSeatId = null;
  }
</script>

<main class="page chart-page">
  <section class="chart-bar">
    <div class="modes" role="group" aria-label="Chart mode">
      <button class:active={mode === "layout"} onclick={() => (mode = "layout")}>Layout</button>
      <button class:active={mode === "assign"} onclick={() => (mode = "assign")}>Seating</button>
    </div>

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
  </section>

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
  {:else}
    <section class="empty"><span>✦</span><h2>Seating arrives next</h2></section>
  {/if}
</main>
