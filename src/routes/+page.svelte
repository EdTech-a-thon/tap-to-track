<script lang="ts">
  import { auth } from "$lib/auth.svelte";

  /**
   * The public front door. Everything behind /chart needs an account, so this page has
   * one job: say what the tool does in a sentence, and get out of the way.
   */

  /**
   * The picture in the hero is the product in miniature: one desk is live, so a visitor
   * can record something before they have an account. Nothing here is saved anywhere.
   */
  const INITIALS = [
    "AK", "TB", "RJ", "SP", "LM",
    "DO", "JW", "CN", "MA", "HF",
    "PR", "EG", "NB", "KT", "IV",
    "FS", "GD", "ZL", "OQ", "YC",
  ];
  /** The desk a visitor can tap — third along, second row back. */
  const LIVE = { name: "Maya A.", x: 22 + 3 * 58, y: 54 + 1 * 42 };

  const seats = INITIALS.map((initials, index) => {
    const row = Math.floor(index / 5);
    const column = index % 5;
    const marks = (row * 5 + column * 3) % 7;
    return {
      initials,
      x: 22 + column * 58,
      y: 54 + row * 42,
      shade: marks > 4 ? 3 : marks > 2 ? 2 : marks > 1 ? 1 : 0,
      live: row === 1 && column === 3,
    };
  });

  const demoBehaviors = [
    { id: "participation", name: "Participation", color: "#3d7ea6" },
    { id: "redirect", name: "Redirect", color: "#cf8a3f" },
  ];

  let open = $state(false);
  let counts = $state<Record<string, number>>({ participation: 0, redirect: 0 });
  let total = $derived(counts.participation + counts.redirect);
  /** Same idea as the real chart: more taps today, darker desk. */
  let liveShade = $derived(Math.min(3, total));

  /** One tap is the whole errand, so recording it hands the room back — as in the app. */
  function record(id: string) {
    counts[id] += 1;
    open = false;
  }

  const steps = [
    {
      title: "Draw your room",
      body: `Create a layout of desks that matches your room.`,
    },
    {
      title: "Seat your classes",
      body: `Drag each student to their desk.`,
    },
    {
      title: "Tap as you teach",
      body: `Tap a desk, press a button. Participation, redirects, or anything else is tallied immediately.`,
    },
    {
      title: "View historical records",
      body: `Every tally is dated, and you can export to Excel or Google Sheets.`,
    },
  ];
</script>

<svelte:window onkeydown={(event) => event.key === "Escape" && (open = false)} />

<svelte:head>
  <title>Tap and Tally — classroom tracking that takes two taps</title>
  <meta
    name="description"
    content="Tap a desk. Tally student participation instantly. Tap and Tally is a seating chart of your actual classroom."
  />
  <link rel="canonical" href="https://tapandtally.com/" />
  <meta property="og:title" content="Tap and Tally" />
  <meta property="og:url" content="https://tapandtally.com/" />
  <meta
    property="og:description"
    content="Tap a desk. Tally participation instantly."
  />
</svelte:head>

<header class="topbar">
  <a class="brand" href="/" aria-label="Tap and Tally home"
    ><span>T&amp;T</span><strong>Tap and Tally</strong></a
  >
  <a class="primary" href="/chart">{auth.teacher ? "Open your chart" : "Sign in"}</a>
</header>

<main class="page home">
  <section class="home-hero">
    <div>
      <h1>Tap a desk. Tally student participation instantly.</h1>
      <p class="lede">
        Seamlessly record student participation, redirects, or any other student behavior while you teach. 
      </p>
      <div class="row">
        <a class="primary" href="/chart">
          {auth.teacher ? "Open your chart" : "Get started — it's free"}
        </a>
      </div>
      <p class="hint">
        Works on a tablet, a phone or the board computer. Nothing to install.
      </p>
    </div>

    <!-- The product in one picture, and a working one: desks shaded by how often a
    child has been tapped today, with one desk live so a visitor can try the tap
    before making an account. -->
    <div class="home-demo">
      <div class="plan-frame">
        <svg class="home-plan" viewBox="0 0 320 220" role="img"
          aria-label="A seating chart: four rows of desks facing the board, labelled with each student's initials and shaded by how often they have been tapped today.">
          <rect class="plan-anchor" x="96" y="8" width="128" height="22" rx="5" />
          <text class="plan-anchor-text" x="160" y="23" text-anchor="middle">BOARD</text>
          {#each seats as seat (seat.initials)}
            {@const shade = seat.live ? liveShade : seat.shade}
            <g class="plan-desk" data-shade={shade}>
              <rect class="plan-seat" x={seat.x} y={seat.y} width="46" height="30" rx="7" />
              <text class="plan-initials" x={seat.x + 23} y={seat.y + 19} text-anchor="middle">
                {seat.initials}
              </text>
            </g>
          {/each}
        </svg>

        <!-- Sits over the live desk, in the picture's own proportions, so it stays on the
        desk at every width. -->
        <button
          class="plan-tap"
          class:open
          style:left="{((LIVE.x + 23) / 320) * 100}%"
          style:top="{((LIVE.y + 15) / 220) * 100}%"
          aria-expanded={open}
          aria-label="Record something for {LIVE.name}"
          onclick={() => (open = !open)}
        ></button>

        {#if open}
          <div
            class="plan-popup"
            role="dialog"
            aria-label="Record for {LIVE.name}"
            style:--x="{((LIVE.x + 23) / 320) * 100}%"
            style:--y="{((LIVE.y + 15) / 220) * 100}%"
          >
            <strong>{LIVE.name}</strong>
            <div class="plan-popup-buttons">
              {#each demoBehaviors as behavior}
                <button style:--tap-color={behavior.color} onclick={() => record(behavior.id)}>
                  <strong>{counts[behavior.id]}</strong>
                  <span>{behavior.name}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <p class="plan-caption">
        {#if total}
          That's {total} {total === 1 ? "tap" : "taps"} on {LIVE.name} today — the desk
          darkens as they add up.
        {:else}
          Try it: tap the highlighted desk.
        {/if}
      </p>
    </div>
  </section>

  <section class="home-section">
    <h2>How it works</h2>
    <ol class="home-steps">
      {#each steps as step, index}
        <li>
          <span class="step-number">{index + 1}</span>
          <div>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </div>
        </li>
      {/each}
    </ol>
  </section>

  <section class="home-section privacy">
    <h2>What Tap & Tally stores</h2>
    <p>
      A first name and a last initial. No full names. Each teacher has their
      own account, and nobody else can read your classes or your students' records.
    </p>
  </section>
</main>

<footer class="home-footer">
  <p><strong>Tap and Tally</strong> · tapandtally.com</p>
  <p>A first name, a last initial, and whatever you tapped. Nothing else.</p>
</footer>
