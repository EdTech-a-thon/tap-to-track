<script lang="ts">
  import SeatCanvas from "$lib/components/SeatCanvas.svelte";
  import TapPopup from "$lib/components/TapPopup.svelte";
  import { unseatedIn } from "$lib/domain/assignment";
  import { isAway } from "$lib/domain/taps";
  import { store } from "$lib/store.svelte";
  import type { Student } from "$lib/domain/types";

  let { classId }: { classId: string } = $props();

  let open = $state<Student | null>(null);
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

  function shade(student: Student | undefined) {
    if (!student || !session) return undefined;
    const behaviors = store.behaviors;
    if (isAway(store.taps, session.id, student.id, behaviors)) {
      return behaviors.find((behavior) => behavior.away)?.color ?? "#5a615e";
    }
    return undefined;
  }
</script>

<div class="tracking">
  <SeatCanvas
    seatLabel={(seat) => {
      const student = occupant.get(seat.id);
      return { text: student?.name ?? "", color: shade(student) };
    }}
    onSeatClick={(seat) => pick(occupant.get(seat.id))}
  />

  {#if unseated.length}
    <div class="unseated">
      <h2>Not seated <span class="hint">({unseated.length})</span></h2>
      <ul>
        {#each unseated as student (student.id)}
          <li>
            <button class="chip" style:background={shade(student)} onclick={() => pick(student)}>
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
