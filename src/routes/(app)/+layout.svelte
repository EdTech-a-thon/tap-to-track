<script lang="ts">
  import { page } from "$app/state";
  import { auth } from "$lib/auth.svelte";
  import SignIn from "$lib/components/SignIn.svelte";
  import { ui } from "$lib/ui.svelte";
  let { children } = $props();

  const sections = [
    { href: "/chart", label: "Chart" },
    { href: "/setup", label: "Setup" },
    { href: "/analytics", label: "Analytics" },
  ];
</script>

{#if !auth.ready}
  <main class="loading">Opening your classes…</main>
{:else if !auth.teacher}
  <SignIn />
{:else}
  {#if !ui.teaching}
    <header class="topbar">
      <a class="brand" href="/chart" aria-label="Tap and Tally home"
        ><span>T&amp;T</span><strong>Tap and Tally</strong></a
      >
      <nav aria-label="Main sections">
        {#each sections as section}
          <a href={section.href} class:active={page.url.pathname === section.href}>{section.label}</a>
        {/each}
      </nav>
      <button class="linkish" onclick={() => auth.signOut()}>Sign out</button>
    </header>
  {/if}

  {@render children()}
{/if}
