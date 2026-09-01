<script lang="ts">
  import SiteHeader from "$lib/components/SiteHeader.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import edtechathonLogo from "$lib/assets/edtechathon-logo.svg";
  import participants from "$lib/assets/edtechathon-2026.jpg";
</script>

<svelte:head>
  <title>About — Tap and Tally</title>
  <meta
    name="description"
    content="Tap and Tally is a free classroom tool from the EdTech-a-thon: no paywalls, no ads, no tracking of personal data."
  />
  <link rel="canonical" href="https://tapandtally.com/about" />
</svelte:head>

<SiteHeader />

<main class="page doc">
  <h1>About</h1>
  <p class="lede">
    A touch-first way to record what happens in a classroom, built for teachers and
    their students.
  </p>

  <section class="card">
    <div class="card-heading">
      <img class="mark" src={edtechathonLogo} alt="" width="40" height="40" />
      <h2>From the EdTech-a-thon</h2>
    </div>
    <p>
      Tap and Tally is a project from the
      <a href="https://edtechathon.com" target="_blank" rel="noopener noreferrer">
        EdTech-a-thon</a
      >, a community of builders making free tools for classrooms. Learn more about who
      we are and what else we're building at
      <a href="https://edtechathon.com" target="_blank" rel="noopener noreferrer">
        edtechathon.com</a
      >.
    </p>

    <figure class="snapshot">
      <img src={participants} alt="Participants of the 2026 EdTech-a-thon" />
      <figcaption>EdTech-a-thon 2026</figcaption>
    </figure>
  </section>

  <section class="card">
    <h2>Our promise</h2>
    <ul class="promise">
      <li><strong>Zero paywalls.</strong></li>
      <li><strong>Zero ads.</strong></li>
      <li><strong>Zero tracking of personal data.</strong></li>
    </ul>
  </section>

  <section class="card">
    <h2>Feedback &amp; ideas</h2>
    <p>
      We'd love to hear from you. Tell us what's working, what's not, or pitch us an idea
      for a tool you wish existed. We're here to help.
    </p>
    <a class="primary" href="mailto:support@tapandtally.com?subject=tapandtally%20feedback">
      Email support@tapandtally.com
    </a>
  </section>
</main>

<Footer />
