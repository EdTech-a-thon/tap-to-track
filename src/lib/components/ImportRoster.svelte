<script lang="ts">
  import { clashingIndexes, parseCsvRoster, parsePastedRoster } from "$lib/domain/roster";
  import { store } from "$lib/store.svelte";

  let { classId }: { classId: string } = $props();

  let pasted = $state("");
  let pending = $state<string[]>([]);
  let busy = $state(false);

  let existing = $derived(store.studentsIn(classId).map((student) => student.name));
  let clashing = $derived(new Set(clashingIndexes(existing, pending)));

  function preview(names: string[]) {
    pending = names;
    pasted = "";
  }

  async function readCsv(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    preview(parseCsvRoster(await file.text()));
  }

  async function confirm() {
    busy = true;
    await store.addStudents(classId, pending);
    pending = [];
    busy = false;
  }
</script>

<h2>Add students</h2>
<p class="hint">
  Tap-to-Track keeps a first name and up to three letters of a surname — never a full
  name. If two students would read the same, you'll be asked to add a letter.
</p>

{#if !pending.length}
  <label>Paste a list <small>One per line, or separated by commas</small>
    <textarea bind:value={pasted} rows="5" placeholder="Avery&#10;Jordan&#10;Kai"></textarea>
  </label>
  <div class="row">
    <button class="primary" disabled={!pasted.trim()} onclick={() => preview(parsePastedRoster(pasted))}>
      Preview names
    </button>
    <label class="filepick">Or upload a CSV
      <input type="file" accept=".csv,text/csv" onchange={readCsv} />
    </label>
  </div>
{:else}
  <p class="hint">
    {pending.length} name{pending.length === 1 ? "" : "s"} ready.
    {#if clashing.size}
      <strong>{clashing.size} need{clashing.size === 1 ? "s" : ""} another letter before you can add them.</strong>
    {/if}
  </p>
  <ul class="roster-list">
    {#each pending as name, index}
      <li class:clash={clashing.has(index)}>
        <input value={name} aria-label="Student name"
          oninput={(event) => (pending[index] = event.currentTarget.value)} />
        {#if clashing.has(index)}<span class="flag">Reads the same as another student</span>{/if}
        <button onclick={() => (pending = pending.filter((_, i) => i !== index))}>Remove</button>
      </li>
    {/each}
  </ul>
  <div class="row">
    <button class="primary" disabled={busy || clashing.size > 0} onclick={confirm}>
      {busy ? "Adding…" : `Add ${pending.length} student${pending.length === 1 ? "" : "s"}`}
    </button>
    <button class="secondary" onclick={() => (pending = [])}>Start over</button>
  </div>
{/if}
