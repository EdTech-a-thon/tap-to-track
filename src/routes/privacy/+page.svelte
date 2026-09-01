<script lang="ts">
  import SiteHeader from "$lib/components/SiteHeader.svelte";
  import Footer from "$lib/components/Footer.svelte";
</script>

<svelte:head>
  <title>Privacy — Tap and Tally</title>
  <meta
    name="description"
    content="What Tap and Tally collects, what it doesn't, and why. A first name, a last initial, and whatever you tapped."
  />
  <link rel="canonical" href="https://tapandtally.com/privacy" />
</svelte:head>

<SiteHeader />

<main class="page doc">
  <h1>Privacy</h1>
  <p class="lede">What we collect, what we don't, and why.</p>

  <section class="card">
    <h2>What we store about children</h2>
    <p>
      Tap and Tally stores a first name and at most three letters of a surname — enough
      to tell two Mayas apart, and no more. It never stores full names, student
      identifiers, dates of birth, photos, or anything else that identifies a child
      outside your classroom. Alongside those display names it keeps the taps you record:
      a student, a behavior, and the moment it happened.
    </p>
  </section>

  <section class="card">
    <h2>Who can read it</h2>
    <p>
      Each teacher has their own account, and nobody else — signed in or not — can read
      your classes, your rosters or your students' records. We do not share, sell, or
      otherwise transfer any of it to third parties. You can export your own data as a
      spreadsheet from the analytics page at any time.
    </p>
  </section>

  <section class="card">
    <h2>Visitors to the site</h2>
    <p>
      We use Cloudflare Web Analytics to anonymously count the number of visits, which
      helps us understand how Tap and Tally is being used in classrooms. Cloudflare Web
      Analytics is cookieless, does not fingerprint visitors, and does not track users
      across other sites; see Cloudflare's
      <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">
        privacy policy</a
      > for details. Your sign-in is kept in your browser so you are not asked for a password
      every morning, and taps queue in your browser when the network drops so a lost connection
      costs you nothing.
    </p>
  </section>

  <section class="card">
    <h2>Questions</h2>
    <p>
      Questions or concerns — or a request to delete an account and everything in it?
      Email
      <a href="mailto:support@tapandtally.com?subject=tapandtally%20privacy">
        support@tapandtally.com</a
      >.
    </p>
  </section>
</main>

<Footer />
