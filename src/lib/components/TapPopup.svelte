<script lang="ts">
  import { behaviorsFor } from "$lib/domain/behaviors";
  import { countsFor, isAway, isOn, popupGrid } from "$lib/domain/taps";
  import { store } from "$lib/store.svelte";
  import type { Student } from "$lib/domain/types";

  let { student, onClose }: { student: Student; onClose: () => void } = $props();

  let cls = $derived(store.classes.find((item) => item.id === student.classId));
  let buttons = $derived(behaviorsFor(store.behaviors, cls?.behaviorIds ?? []));
  let grid = $derived(popupGrid(buttons.length));
  let session = $derived(store.openSession);
  let counts = $derived(session ? countsFor(store.taps, session.id, student.id) : {});
  let away = $derived(session ? isAway(store.taps, session.id, student.id, store.behaviors) : false);
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
        {@const on = session ? isOn(store.taps, session.id, student.id, behavior.id) : false}
        {@const locked = away && !behavior.away}
        <button
          class="tap-button"
          class:on
          disabled={locked}
          style:--tap-color={behavior.color}
          onclick={() => store.tap(student.id, behavior)}
        >
          <strong>{behavior.mode === "toggle" ? (on ? "On" : "—") : (counts[behavior.id] ?? 0)}</strong>
          <span>{behavior.name}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
