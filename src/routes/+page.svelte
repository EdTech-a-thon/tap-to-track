<script lang="ts">
  import { auth } from "$lib/auth.svelte";

  /**
   * The public front door. Everything behind /chart needs an account, so this page has
   * one job: say what the tool does and who it is for, clearly enough that a teacher
   * knows within a screen whether it is worth making an account for.
   */
  const steps = [
    {
      title: "Draw your room once",
      body: `Say how many desks you have and pick a ready-made shape, or start from blank.
        Drag desks where they belong and they line up on a grid. Add anchors — the door,
        the board, your own desk — so the chart faces the way you do.`,
    },
    {
      title: "Seat your classes in it",
      body: `Drag a student onto a desk; drop them on a taken one to swap. The room is
        shared by every class that meets in it, but each class keeps its own seating, so
        moving furniture never disturbs who sits where.`,
    },
    {
      title: "Tap a face, press a button",
      body: `Up to six things to track — participation, positive behavior, a redirect,
        absent. Some count every tap; some toggle on and off for the day. Counts update
        instantly, a toast offers an undo, and full screen leaves just the room.`,
    },
    {
      title: "Read it back afterwards",
      body: `Every tap is stored with the moment it happened, so the week, the month or
        the term is there in a table — per student, per behavior, per class — and
        downloadable as a spreadsheet.`,
    },
  ];

  const audience = [
    {
      who: "Teachers who want participation to be fair",
      body: `The quiet child who was never asked is invisible in your memory and obvious
        in a week of taps. Shading the chart by a behavior shows you who has not been
        called on yet — while you can still do something about it.`,
    },
    {
      who: "Anyone building a case with evidence",
      body: `A parent meeting, a referral or a support plan goes better with dates and
        counts than with an impression. Export the range you need and bring the numbers.`,
    },
    {
      who: "Supply and rotating staff",
      body: `A seating chart that faces the right way is how you learn a room you did not
        set up. Names sit where the children do, so you can use them on day one.`,
    },
    {
      who: "Teachers with no time for admin",
      body: `There is nothing to start and nothing to end. Counts cover today and start
        clean tomorrow. Recording something takes two taps, mid-sentence, without
        turning away from the class.`,
    },
  ];
</script>

<svelte:head>
  <title>Tap and Tally — classroom tracking that takes two taps</title>
  <meta
    name="description"
    content="Tap and Tally is a touch-first seating chart. Draw your room, seat your students, and tap a face to record participation, behavior or absence — then read the term back as a table."
  />
  <link rel="canonical" href="https://tapandtally.com/" />
  <meta property="og:title" content="Tap and Tally" />
  <meta property="og:url" content="https://tapandtally.com/" />
  <meta
    property="og:description"
    content="A seating chart of your actual classroom. Tap a face to record what happened, and get the patterns back afterwards."
  />
</svelte:head>

<header class="topbar">
  <a class="brand" href="/" aria-label="Tap and Tally home"
    ><span>T&amp;T</span><strong>Tap and Tally</strong></a
  >
  <nav class="home-nav" aria-label="This page">
    <a href="#how">How it works</a>
    <a href="#who">Who it's for</a>
    <a href="#privacy">Privacy</a>
  </nav>
  <a class="primary" href="/chart">{auth.teacher ? "Open your chart" : "Sign in"}</a>
</header>

<main class="page home">
  <section class="home-hero">
    <div>
      <p class="eyebrow">Classroom participation and behavior</p>
      <h1>Tap a face. That's the whole workflow.</h1>
      <p class="lede">
        Tap and Tally is a seating chart of your actual room. Tap a student, press a button,
        and carry on teaching — every tap is kept, so the patterns you cannot hold in your
        head are waiting for you in a table afterwards.
      </p>
      <div class="row">
        <a class="primary" href="/chart">
          {auth.teacher ? "Open your chart" : "Get started — it's free"}
        </a>
        <a class="secondary" href="#demo">Look around first</a>
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

  <section class="home-band">
    <div><strong>2</strong><span>taps to record something</span></div>
    <div><strong>6</strong><span>things you can track</span></div>
    <div><strong>0</strong><span>full names stored</span></div>
  </section>

  <section id="how" class="home-section">
    <h2>How it works</h2>
    <p class="lede">
      Four things happen, and only the third one happens during a lesson.
    </p>
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

  <section id="who" class="home-section">
    <h2>Who needs this</h2>
    <p class="lede">
      Anyone who has ever tried to remember, at four o'clock, who spoke in third period.
    </p>
    <div class="home-cards">
      {#each audience as item}
        <article class="home-card">
          <h3>{item.who}</h3>
          <p>{item.body}</p>
        </article>
      {/each}
    </div>
  </section>

  <section class="home-section">
    <h2>What you get back</h2>
    <div class="home-cards">
      <article class="home-card">
        <h3>Colour on the chart, as it happens</h3>
        <p>
          Pick one behavior and the desks shade by how many times each student has been
          marked today — not merely whether they have. A pale room is a room where you
          have not got round to everyone yet.
        </p>
      </article>
      <article class="home-card">
        <h3>Counts you can hand to someone</h3>
        <p>
          The last week, the last month or all time, filtered by behavior and class,
          sorted by whichever column matters, and downloadable as a spreadsheet.
        </p>
      </article>
      <article class="home-card">
        <h3>A dropped connection costs nothing</h3>
        <p>
          School wifi being school wifi, taps queue on the device and save themselves when
          the network comes back. The count moves the moment you press.
        </p>
      </article>
      <article class="home-card">
        <h3>Nothing to start or end</h3>
        <p>
          No sessions, no register to open, no lesson to close. Counts cover your calendar
          day and start clean the next morning.
        </p>
      </article>
    </div>
  </section>

  <section id="privacy" class="home-section privacy">
    <h2>What it stores about children</h2>
    <p>
      A first name and at most three letters of a surname — enough to tell two Mayas
      apart, and no more. Never full names, never student identifiers, never photos.
      Each teacher has their own account, and nobody else, signed in or not, can read
      your classes or your students' records.
    </p>
  </section>

  <section id="demo" class="home-cta">
    <h2>Have a look around</h2>
    <p>
      Sign in with the demo account to see a furnished room with a class already in it.
      Nothing you do to it matters.
    </p>
    <p class="demo-credentials">
      <span><small>Email</small><code>demo@tapandtally.com</code></span>
      <span><small>Password</small><code>demoteacher</code></span>
    </p>
    <a class="primary" href="/chart">
      {auth.teacher ? "Open your chart" : "Sign in or make an account"}
    </a>
  </section>
</main>

<footer class="home-footer">
  <p><strong>Tap and Tally</strong> · tapandtally.com</p>
  <p>A first name, three letters, and whatever you tapped. Nothing else.</p>
</footer>
