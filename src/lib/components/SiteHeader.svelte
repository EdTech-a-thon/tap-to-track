<script lang="ts">
  import { auth } from "$lib/auth.svelte";

  /** The top bar on every public page: the wordmark, and the one way in. */
</script>

<header class="topbar">
  <a class="brand" href="/" aria-label="Tap and Tally home"
    ><span>T&amp;T</span><strong>Tap and Tally</strong></a
  >
  <a class="primary topbar-cta" href="/chart">{auth.teacher ? "Open your chart" : "Sign in"}</a>
</header>
