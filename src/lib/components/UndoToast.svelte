<script lang="ts">
  import { store } from "$lib/store.svelte";

  // The toast is worth showing only while the mistake is fresh.
  let visible = $state(false);
  $effect(() => {
    if (!store.lastTap) return;
    visible = true;
    const timer = setTimeout(() => (visible = false), 6000);
    return () => clearTimeout(timer);
  });
</script>

{#if visible && store.lastTap}
  <div class="toast" role="status">
    <span>{store.lastTap.behaviorName} for {store.lastTap.studentName}</span>
    <button onclick={() => store.removeTap(store.lastTap!.id)}>Undo</button>
    <button aria-label="Dismiss" onclick={() => (visible = false)}>×</button>
  </div>
{/if}
