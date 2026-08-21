<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { auth } from "$lib/auth.svelte";
  import SignIn from "$lib/components/SignIn.svelte";
  import "../styles.css";
  let { children } = $props();

  onMount(() => auth.restore());

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

{#if !auth.ready}
  <main class="loading">Opening your classes…</main>
{:else if !auth.teacher}
  <SignIn />
{:else}
  <header class="topbar">
    <a class="brand" href="/" aria-label="Tap-to-Track home"><span>T</span><strong>Tap-to-Track</strong></a>
    <nav aria-label="Main sections">
      {#each sections as section}
        <a href={section.href} class:active={page.url.pathname === section.href}>{section.label}</a>
      {/each}
    </nav>
    <button class="linkish" onclick={() => auth.signOut()}>Sign out</button>
  </header>

  {@render children()}
{/if}
