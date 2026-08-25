<script lang="ts">
  import { auth } from "$lib/auth.svelte";

  let mode: "in" | "up" = $state("in");
  let email = $state("");
  let password = $state("");
  let error = $state("");
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = "";
    try {
      if (mode === "in") await auth.signIn(email, password);
      else await auth.signUp(email, password);
    } catch {
      error = mode === "in"
        ? "That email and password didn't match. Try again?"
        : "Couldn't create that account. The email may already be in use, or the password may be under 8 characters.";
    }
    busy = false;
  }
</script>

<main class="page signin">
  <!-- The way back out: the app's front door is a page of its own, so signing in must not
  be a dead end for someone who arrived here before they were ready. -->
  <a class="brand signin-brand" href="/"><span>T&amp;T</span><strong>Tap and Tally</strong></a>
  <section class="panel">
    <h1>{mode === "in" ? "Welcome back" : "Create your account"}</h1>
    <p>Your classes and your students' records are yours alone. Nobody else can see them.</p>
    <form onsubmit={submit}>
      <label>Email <input type="email" bind:value={email} required autocomplete="email" /></label>
      <label>Password
        <input type="password" bind:value={password} required minlength="8"
          autocomplete={mode === "in" ? "current-password" : "new-password"} />
      </label>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="primary" type="submit" disabled={busy}>
        {busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}
      </button>
    </form>
    <button class="linkish" onclick={() => { mode = mode === "in" ? "up" : "in"; error = ""; }}>
      {mode === "in" ? "I don't have an account yet" : "I already have an account"}
    </button>
  </section>
</main>
