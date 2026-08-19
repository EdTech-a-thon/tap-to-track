<script lang="ts">
  import "../styles.css";
  let { children } = $props();
</script>

<svelte:head>
  <title>Tap-to-Track</title>
  <meta name="description" content="Simple, touch-first classroom participation tracking" />
</svelte:head>

{@render children()}
