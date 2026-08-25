<script lang="ts">
  import { behaviorsFor } from "$lib/domain/behaviors";
  import { countsFor, isAway, isOn, popupGrid, today } from "$lib/domain/taps";
  import { store } from "$lib/store.svelte";
  import type { Behavior, Student } from "$lib/domain/types";

  let { student, onClose }: { student: Student; onClose: () => void } = $props();

  let cls = $derived(store.classes.find((item) => item.id === student.classId));
  let buttons = $derived(behaviorsFor(store.behaviors, cls?.behaviorIds ?? []));
  let grid = $derived(popupGrid(buttons.length));
  let day = today();
  // The popup counts what the chart shows, so clearing the desks zeroes it here too.
  let taps = $derived(store.chartTaps(student.classId));
  let counts = $derived(countsFor(taps, day, student.id));
  let away = $derived(isAway(taps, day, student.id, store.behaviors));

  /** One tap is the whole errand, so recording it closes the popup and hands the room back. */
  const record = (behavior: Behavior) => () => {
    store.tap(student.id, behavior);
    onClose();
  };
</script>

<div class="scrim" role="presentation" onclick={onClose}></div>

<div class="popup" role="dialog" aria-modal="true" aria-label="Record for {student.name}">
  <header>
    <div>
      <h2>{student.name}</h2>
      {#if away}<p class="hint">Marked as away — tap it again when they arrive.</p>{/if}
    </div>
    <button class="close" aria-label="Close" onclick={onClose}>×</button>
  </header>

  {#if !buttons.length}
    <p class="hint">
      This class has no buttons turned on yet. Choose some in Setup.
    </p>
  {:else}
    <div class="tap-grid" style:grid-template-columns="repeat({grid.columns}, 1fr)">
      {#each buttons as behavior (behavior.id)}
        {@const on = isOn(taps, day, student.id, behavior.id)}
        {@const locked = away && !behavior.away}
        <button
          class="tap-button"
          class:on
          disabled={locked}
          style:--tap-color={behavior.color}
          onclick={record(behavior)}
        >
          <strong>{behavior.mode === "toggle" ? (on ? "On" : "—") : (counts[behavior.id] ?? 0)}</strong>
          <span>{behavior.name}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
