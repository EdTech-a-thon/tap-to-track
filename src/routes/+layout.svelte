<script lang="ts">
  import { onMount } from "svelte";
  import { auth } from "$lib/auth.svelte";
  import "../styles.css";
  let { children } = $props();

  // Restoring here rather than in the app shell, so the homepage can also tell a
  // signed-in teacher apart from a visitor and offer them their chart instead.
  onMount(() => auth.restore());
</script>

<svelte:head>
  <title>Tap and Tally</title>
  <meta name="description" content="Simple, touch-first classroom participation tracking" />
</svelte:head>

{@render children()}
