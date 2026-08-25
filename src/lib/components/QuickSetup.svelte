<script lang="ts">
  import { MAX_DESKS, choiceBounds, deskCount, layoutChoices } from "$lib/domain/layouts";
  import { GRID, SEAT_SIZE } from "$lib/domain/seating";
  import { store } from "$lib/store.svelte";
  import type { LayoutChoice } from "$lib/domain/layouts";

  /** Called once the room exists, or once the teacher decides to draw it themselves. */
  let { onDone, onBlank }: { onDone: () => void; onBlank: () => void } = $props();

  /** Asking how many desks first is what makes the shapes worth looking at. */
  type Step = "count" | "shape";
  let step: Step = $state("count");
  let desks = $state(30);
  let building = $state<string | null>(null);

  let choices = $derived(layoutChoices(desks));

  function nudge(by: number) {
    desks = deskCount(desks + by);
  }

  async function build(choice: LayoutChoice) {
    if (building) return;
    building = choice.id;
    try {
      await store.addSeats(choice.seats);
      onDone();
    } finally {
      building = null;
    }
  }

  /** A little room around the desks, so the outermost ones aren't clipped by the frame. */
  function viewBox(choice: LayoutChoice) {
    const box = choiceBounds(choice.seats);
    const pad = GRID;
    return `${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`;
  }
</script>

<section class="quick">
  {#if step === "count"}
    <div class="panel quick-count">
      <p class="eyebrow">Set up your room</p>
      <h2>How many desks are in your classroom?</h2>
      <p class="hint">A rough count is fine — desks can be added, moved or removed at any time.</p>

      <div class="counter">
        <button class="secondary" aria-label="One fewer desk" onclick={() => nudge(-1)}>−</button>
        <input type="number" inputmode="numeric" min="1" max={MAX_DESKS} aria-label="Number of desks"
          bind:value={desks} onchange={() => (desks = deskCount(desks))} />
        <button class="secondary" aria-label="One more desk" onclick={() => nudge(1)}>+</button>
      </div>

      <button class="primary" onclick={() => (step = "shape")}>Show me some layouts</button>
    </div>
  {:else}
    <header class="quick-head">
      <div>
        <p class="eyebrow">Set up your room</p>
        <h2>Pick a starting layout for {desks} desk{desks === 1 ? "" : "s"}</h2>
        <p class="hint">Whichever you pick, every desk can be dragged where it really belongs.</p>
      </div>
      <button class="secondary" onclick={() => (step = "count")}>Change the number</button>
    </header>

    <!-- Five rooms and a blank one, so the choice is a glance rather than a decision. -->
    <div class="choices">
      {#each choices as choice (choice.id)}
        <button class="choice" disabled={!!building} onclick={() => build(choice)}>
          <svg class="choice-plan" viewBox={viewBox(choice)} preserveAspectRatio="xMidYMid meet"
            role="presentation">
            {#each choice.seats as spot, index (index)}
              <rect x={spot.x} y={spot.y} width={SEAT_SIZE} height={SEAT_SIZE} rx="14" />
            {/each}
          </svg>
          <strong>{building === choice.id ? "Placing the desks…" : choice.name}</strong>
          <span class="hint">{choice.hint}</span>
        </button>
      {/each}

      <button class="choice blank" disabled={!!building} onclick={onBlank}>
        <span class="choice-plan empty-plan" aria-hidden="true">＋</span>
        <strong>Start from blank</strong>
        <span class="hint">An empty room. Add and place every desk yourself.</span>
      </button>
    </div>
  {/if}
</section>
