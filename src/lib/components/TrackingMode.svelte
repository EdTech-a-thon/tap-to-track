<script lang="ts">
  import HighlightPicker from "$lib/components/HighlightPicker.svelte";
  import SeatCanvas from "$lib/components/SeatCanvas.svelte";
  import TapPopup from "$lib/components/TapPopup.svelte";
  import { unseatedIn } from "$lib/domain/assignment";
  import { seatShade } from "$lib/domain/highlight";
  import { store } from "$lib/store.svelte";
  import type { Student } from "$lib/domain/types";

  let { classId }: { classId: string } = $props();

  let open = $state<Student | null>(null);
  let highlightId = $state<string | null>(null);

  // The Highlight is a per-Class habit, so each period opens showing what matters in it.
  const remembered = (id: string) => `tap-to-track-highlight-${id}`;
  $effect(() => {
    highlightId = localStorage.getItem(remembered(classId));
  });
  function remember(id: string | null) {
    if (id) localStorage.setItem(remembered(classId), id);
    else localStorage.removeItem(remembered(classId));
  }
  let askingToStart = $state<Student | null>(null);

  let students = $derived(store.studentsIn(classId));
  let unseated = $derived(unseatedIn(store.students, classId));
  let occupant = $derived(new Map(students.filter((s) => s.seatId).map((s) => [s.seatId, s])));
  let session = $derived(store.openSession);

  /** A tap with no Session open offers to start one rather than recording silently. */
  function pick(student: Student | undefined) {
    if (!student) return;
    if (!session) askingToStart = student;
    else open = student;
  }

  async function startAndOpen() {
    const student = askingToStart!;
    askingToStart = null;
    await store.startSession(classId);
    open = student;
  }

  let highlight = $derived(store.behaviors.find((behavior) => behavior.id === highlightId) ?? null);

  function shade(student: Student | undefined) {
    if (!student) return { away: false } as ReturnType<typeof seatShade>;
    return seatShade(store.taps, session?.id ?? null, student.id, highlight, store.behaviors);
  }
</script>

<div class="tracking">
  <div class="tracking-bar">
    <HighlightPicker {classId} bind:value={
      () => highlightId,
      (next) => { highlightId = next; remember(next); }
    } />
  </div>

  <SeatCanvas
    seatLabel={(seat) => {
      const student = occupant.get(seat.id);
      const look = shade(student);
      return {
        text: student?.name ?? "",
        color: look.color,
        strong: look.away || look.color?.endsWith("ff"),
      };
    }}
    onSeatClick={(seat) => pick(occupant.get(seat.id))}
  />

  {#if unseated.length}
    <div class="unseated">
      <h2>Not seated <span class="hint">({unseated.length})</span></h2>
      <ul>
        {#each unseated as student (student.id)}
          <li>
            <button class="chip" class:strong={shade(student).away}
              style:background={shade(student).color} onclick={() => pick(student)}>
              {student.name}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

{#if open}
  <TapPopup student={open} onClose={() => (open = null)} />
{/if}

{#if askingToStart}
  <div class="scrim" role="presentation" onclick={() => (askingToStart = null)}></div>
  <div class="popup narrow" role="dialog" aria-modal="true" aria-label="Start class">
    <h2>Start class first?</h2>
    <p class="hint">
      Nothing is recorded until a class is running, so a stray tap while you set the room
      up doesn't become part of a lesson.
    </p>
    <div class="row">
      <button class="primary" onclick={startAndOpen}>Start class and record</button>
      <button class="secondary" onclick={() => (askingToStart = null)}>Not yet</button>
    </div>
  </div>
{/if}
