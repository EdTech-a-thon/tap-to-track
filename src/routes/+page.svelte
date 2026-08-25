<script lang="ts">
  import { onMount, tick } from "svelte";
  import QuickSetup from "$lib/components/QuickSetup.svelte";
  import SeatCanvas from "$lib/components/SeatCanvas.svelte";
  import SeatingMode from "$lib/components/SeatingMode.svelte";
  import TrackingMode from "$lib/components/TrackingMode.svelte";
  import UndoToast from "$lib/components/UndoToast.svelte";
  import { seatDeletionImpact } from "$lib/domain/assignment";
  import { nextAnchorSpot, nextSeatSpot } from "$lib/domain/seating";
  import { store } from "$lib/store.svelte";
  import { ui } from "$lib/ui.svelte";

  type Mode = "track" | "configure";
  /** Configuring the room is mostly seating students; moving desks is a step aside from that. */
  type ConfigureMode = "seating" | "layout";
  let mode: Mode = $state("track");
  let configuring: ConfigureMode = $state("seating");
  let snapping = $state(true);
  /** The one piece of furniture being worked on: a desk to move or delete, or an anchor to write. */
  let selected = $state<{ kind: "seat" | "anchor"; id: string } | null>(null);
  /**
   * The quick setup is a first-time offer. Once the teacher has been past it and into the
   * layout editor, an empty room is their own doing and the offer stays out of the way.
   */
  let setupDone = $state(false);
  let anchorBox = $state<HTMLInputElement>();

  onMount(() => store.load());

  let selectedSeat = $derived(selected?.kind === "seat"
    ? store.seats.find((seat) => seat.id === selected!.id) : undefined);
  let selectedAnchor = $derived(selected?.kind === "anchor"
    ? store.anchors.find((anchor) => anchor.id === selected!.id) : undefined);
  // An empty room is a room nobody can teach in, so building one comes before everything else.
  let needsSetup = $derived(store.loaded && !store.seats.length && !setupDone);

  function toggleConfiguring() {
    configuring = configuring === "layout" ? "seating" : "layout";
    if (configuring === "layout") setupDone = true;
    selected = null;
  }

  function goToLayout() {
    mode = "configure";
    configuring = "layout";
    setupDone = true;
    selected = null;
  }

  function addSeat() {
    const spot = nextSeatSpot(store.seats);
    store.addSeat(spot.x, spot.y);
  }

  /** A new anchor is born empty and selected, with the cursor already in it, so it can be named. */
  async function addAnchor() {
    const spot = nextAnchorSpot(store.seats, store.anchors);
    const id = await store.addAnchor("", spot.x, spot.y);
    selected = { kind: "anchor", id };
    await tick();
    anchorBox?.focus();
  }

  /** Typing shows in the room straight away; the writing down waits until the teacher stops. */
  function typeAnchor(id: string, label: string) {
    store.anchors = store.anchors.map((anchor) =>
      (anchor.id === id ? { ...anchor, label } : anchor));
  }

  /** The Layout is shared, so one deletion can unseat students in several Classes. */
  function deleteSelected() {
    if (selectedAnchor) {
      store.deleteAnchor(selectedAnchor.id);
      selected = null;
      return;
    }
    if (!selectedSeat) return;
    const impact = seatDeletionImpact(store.students, selectedSeat.id);
    const warning = impact.classCount
      ? `This desk is in use by ${impact.students.length} student${impact.students.length === 1 ? "" : "s"} across ${impact.classCount} class${impact.classCount === 1 ? "" : "es"}. Deleting it leaves them without a seat. Continue?`
      : "Delete this desk?";
    if (!confirm(warning)) return;
    store.deleteSeat(selectedSeat.id);
    selected = null;
  }

  function pickSeat(id: string) {
    selected = selected?.kind === "seat" && selected.id === id ? null : { kind: "seat", id };
  }

  function pickAnchor(id: string) {
    selected = selected?.kind === "anchor" && selected.id === id ? null : { kind: "anchor", id };
  }
</script>

<main class="page chart-page">
  {#if !ui.teaching && store.loaded && !needsSetup}
    {#if mode === "configure" && configuring === "layout"}
      <!-- Rearranging is a room-wide job, so the tabs, the class and the chart tools all
      step out of the way until the teacher is done with the furniture. -->
      <section class="chart-bar layout-bar">
        <div class="bar-side">
          <button class="secondary" onclick={addSeat}>Add a desk</button>
          <button class="secondary" onclick={addAnchor}>Add an anchor</button>
          <label class="check">
            <input type="checkbox" bind:checked={snapping} />
            Line desks up
          </label>
        </div>

        {#if selectedAnchor}
          <!-- A selected anchor is written here rather than in the room itself, so the box
          in the room keeps the size and the type the teacher gave it. -->
          <div class="bar-center anchor-edit">
            <input bind:this={anchorBox} class="anchor-input" aria-label="Anchor text"
              placeholder="Door, Board, My desk" value={selectedAnchor.label}
              oninput={(event) => typeAnchor(selectedAnchor!.id, event.currentTarget.value)}
              onchange={(event) =>
                store.updateAnchor(selectedAnchor!.id, { label: event.currentTarget.value })} />
            <button class="leave" onclick={deleteSelected}>Delete anchor</button>
          </div>
        {:else if selectedSeat}
          <div class="bar-center anchor-edit">
            <p class="layout-flag">Desk selected</p>
            <button class="leave" onclick={deleteSelected}>Delete desk</button>
          </div>
        {:else}
          <p class="bar-center layout-flag">Rearranging desk layout</p>
        {/if}

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
  {:else if needsSetup}
    <!-- Nothing else on this page means anything until there are desks to sit in. -->
    <QuickSetup onDone={goToLayout} onBlank={goToLayout} />
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
    {#if !store.seats.length && !store.anchors.length}
      <section class="empty">
        <span>✦</span>
        <h2>Draw your room</h2>
        <p>Add a desk for each seat in your classroom, then drag them where they belong.</p>
        <button class="primary" onclick={addSeat}>Add the first desk</button>
      </section>
    {:else}
      <p class="hint">
        Drag a desk to move it. Anchors — the door, the board, your own desk — mark where things
        are, so the chart faces the way you do. This is your room: every class you teach in it
        shares the same layout, and moving desks never changes who sits where.
      </p>
      <SeatCanvas
        {snapping}
        draggable
        {selected}
        onSeatClick={(seat) => pickSeat(seat.id)}
        onAnchorClick={(anchor) => pickAnchor(anchor.id)}
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
