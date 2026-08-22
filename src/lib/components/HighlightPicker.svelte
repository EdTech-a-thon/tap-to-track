<script lang="ts">
  import { behaviorsFor } from "$lib/domain/behaviors";
  import { store } from "$lib/store.svelte";

  let { classId, value = $bindable() }: { classId: string; value: string | null } = $props();

  let cls = $derived(store.classes.find((item) => item.id === classId));
  let options = $derived(behaviorsFor(store.behaviors, cls?.behaviorIds ?? []));
</script>

<label class="class-picker highlight">Showing
  <select bind:value>
    <option value={null}>Nothing — plain desks</option>
    {#each options as behavior (behavior.id)}
      <option value={behavior.id}>{behavior.name}</option>
    {/each}
  </select>
</label>
