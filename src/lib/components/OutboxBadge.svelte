<script lang="ts">
  import { outbox } from "$lib/outbox.svelte";
</script>

{#if outbox.pending.length}
  <span class="outbox" role="status" title="These will save themselves when you're back online">
    {outbox.pending.length} not saved yet
  </span>
{/if}
