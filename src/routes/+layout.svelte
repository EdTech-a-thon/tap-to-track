<script lang="ts">
  import { page } from "$app/state";
  import "../styles.css";
  let { children } = $props();

  const sections = [
    { href: "/", label: "Chart" },
    { href: "/setup", label: "Setup" },
    { href: "/analytics", label: "Analytics" },
  ];
</script>

<svelte:head>
  <title>Tap-to-Track</title>
  <meta name="description" content="Simple, touch-first classroom participation tracking" />
</svelte:head>

<header class="topbar">
  <a class="brand" href="/" aria-label="Tap-to-Track home"><span>T</span><strong>Tap-to-Track</strong></a>
  <nav aria-label="Main sections">
    {#each sections as section}
      <a href={section.href} class:active={page.url.pathname === section.href}>{section.label}</a>
    {/each}
  </nav>
</header>

{@render children()}
