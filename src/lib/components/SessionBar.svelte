<script lang="ts">
  import OutboxBadge from "$lib/components/OutboxBadge.svelte";
  import { formatElapsed } from "$lib/domain/sessions";
  import { store } from "$lib/store.svelte";

  let { compact = false }: { compact?: boolean } = $props();

  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });

  let session = $derived(store.openSession);
  let className = $derived(store.classes.find((cls) => cls.id === session?.classId)?.name ?? "");
  let elapsed = $derived(session ? formatElapsed(now - Date.parse(session.openedAt)) : "");
</script>

{#if session}
  <div class="session-bar" class:compact role="status">
    <span class="dot" aria-hidden="true"></span>
    <strong>{className}</strong>
    <span class="clock">{elapsed}</span>
    <OutboxBadge />
    <button class="secondary" onclick={() => store.endSession(session.id)}>End class</button>
  </div>
{/if}
