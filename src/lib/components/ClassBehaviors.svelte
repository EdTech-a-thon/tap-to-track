<script lang="ts">
  import { store } from "$lib/store.svelte";

  let { classId }: { classId: string } = $props();

  let cls = $derived(store.classes.find((item) => item.id === classId));
  let ordered = $derived([...store.behaviors].sort((a, b) => a.position - b.position));
</script>

<h2>Buttons for this class</h2>
<p class="hint">
  A button you never press in this class only slows it down. Turning one off here hides
  it from this class's popup — everything you've already recorded still counts in Analytics.
</p>
<ul class="behavior-list">
  {#each ordered as behavior (behavior.id)}
    <li>
      <label class="check">
        <input type="checkbox" checked={cls?.behaviorIds.includes(behavior.id)}
          onchange={() => store.toggleClassBehavior(classId, behavior.id)} />
        <span class="swatch" style:background={behavior.color}></span>
        {behavior.name}
      </label>
    </li>
  {/each}
</ul>
