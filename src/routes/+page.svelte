<script lang="ts">
  import { auth } from "$lib/auth.svelte";

  /**
   * The public front door. Everything behind /chart needs an account, so this page has
   * one job: say what the tool does in a sentence, and get out of the way.
   */
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

    <!-- The product in one picture: desks in rows, shaded by how often a child has been
    tapped today, with the board anchoring which way the room faces. -->
    <svg class="home-plan" viewBox="0 0 320 220" role="img"
      aria-label="A seating chart: five rows of desks facing a board, some shaded to show how often each student has been tapped today.">
      <rect class="plan-anchor" x="96" y="8" width="128" height="22" rx="5" />
      <text class="plan-anchor-text" x="160" y="23" text-anchor="middle">BOARD</text>
      {#each [0, 1, 2, 3] as row}
        {#each [0, 1, 2, 3, 4] as column}
          {@const shade = (row * 5 + column * 3) % 7}
          <rect class="plan-seat" data-shade={shade > 4 ? "3" : shade > 2 ? "2" : shade > 1 ? "1" : "0"}
            x={22 + column * 58} y={54 + row * 42} width="46" height="30" rx="7" />
        {/each}
      {/each}
      <rect class="plan-anchor" x="12" y="188" width="54" height="22" rx="5" />
      <text class="plan-anchor-text" x="39" y="203" text-anchor="middle">DOOR</text>
      <circle class="plan-tap" cx="219" cy="111" r="17" />
    </svg>
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
