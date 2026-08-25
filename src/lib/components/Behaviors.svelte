<script lang="ts">
  import { absentBehavior, BEHAVIOR_COLORS, BEHAVIOR_LIMIT } from "$lib/domain/behaviors";
  import { store } from "$lib/store.svelte";

  let newName = $state("");

  let ordered = $derived([...store.behaviors].sort((a, b) => a.position - b.position));
  let atLimit = $derived(store.behaviors.length >= BEHAVIOR_LIMIT);
  let absent = $derived(absentBehavior(store.behaviors));

  async function add() {
    const name = newName.trim();
    if (!name || atLimit) return;
    await store.addBehavior(name, BEHAVIOR_COLORS[store.behaviors.length % BEHAVIOR_COLORS.length], "tally");
    newName = "";
  }
</script>

<h2>What you track</h2>
<p class="hint">
  These are the buttons that appear when you tap a student. Up to {BEHAVIOR_LIMIT}, so the
  popup stays fast enough to use without reading it.
</p>

<ul class="behavior-list">
  {#each ordered as behavior, index (behavior.id)}
    <li class:fixed={behavior.away}>
      {#if behavior.away}
        <!-- Absent comes with its rules attached, so there is nothing here to change. -->
        <span class="swatch" style:background={behavior.color}></span>
        <strong class="fixed-name">{behavior.name}</strong>
        <span class="fixed-note">Marks them out of the room for the day</span>
      {:else}
        <input type="color" value={behavior.color} aria-label="{behavior.name} colour"
          onchange={(event) => store.updateBehavior(behavior.id, { color: event.currentTarget.value })} />
        <input value={behavior.name} aria-label="Behavior name"
          onchange={(event) => store.updateBehavior(behavior.id, { name: event.currentTarget.value.trim() })} />
        <label class="mode">
          <select value={behavior.mode}
            onchange={(event) => store.updateBehavior(behavior.id, { mode: event.currentTarget.value as "tally" | "toggle" })}>
            <option value="tally">Counts every tap</option>
            <option value="toggle">On or off for the lesson</option>
          </select>
        </label>
      {/if}
      <button class="nudge" disabled={index === 0} aria-label="Move {behavior.name} up"
        onclick={() => store.moveBehavior(behavior.id, -1)}>↑</button>
      <button class="nudge" disabled={index === ordered.length - 1} aria-label="Move {behavior.name} down"
        onclick={() => store.moveBehavior(behavior.id, 1)}>↓</button>
      <button onclick={() => confirm(`Delete ${behavior.name}? Taps already recorded against it go too.`)
        && store.deleteBehavior(behavior.id)}>Delete</button>
    </li>
  {/each}
</ul>

<label>Add something to track <input bind:value={newName} placeholder="On task" disabled={atLimit} /></label>
{#if atLimit}
  <p class="hint">
    That's {BEHAVIOR_LIMIT} — the most that fits on a popup you can hit without looking.
    Delete one to make room.
  </p>
{:else}
  <div class="row">
    <button class="primary" disabled={!newName.trim()} onclick={add}>Add</button>
    {#if !absent}
      <button class="secondary" onclick={() => store.addAbsentBehavior()}>Add Absent toggle</button>
    {/if}
  </div>
  {#if !absent}
    <p class="hint">
      Absent is a ready-made button: one tap marks a student out of the room for the day,
      greys their desk, and stops anything else being recorded for them until they're back.
    </p>
  {/if}
{/if}
