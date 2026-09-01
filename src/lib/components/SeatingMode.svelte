<script lang="ts">
  import SeatCanvas from "$lib/components/SeatCanvas.svelte";
  import { unseatedIn } from "$lib/domain/assignment";
  import { store } from "$lib/store.svelte";

  let { classId }: { classId: string } = $props();

  let carry = $state<{
    studentId: string;
    name: string;
    x: number;
    y: number;
  } | null>(null);
  let randomizing = $state(false);

  let students = $derived(store.studentsIn(classId));
  let unseated = $derived(unseatedIn(store.students, classId));
  let seated = $derived(students.length - unseated.length);
  let occupant = $derived(
    new Map(students.filter((s) => s.seatId).map((s) => [s.seatId, s])),
  );

  function lift(event: PointerEvent, studentId: string, name: string) {
    event.preventDefault();
    carry = { studentId, name, x: event.clientX, y: event.clientY };
  }

  function liftFromSeat(event: PointerEvent) {
    const seat = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-seat-id]",
    );
    const student = seat ? occupant.get(seat.dataset.seatId!) : undefined;
    if (student) lift(event, student.id, student.name);
  }

  function drag(event: PointerEvent) {
    if (carry) carry = { ...carry, x: event.clientX, y: event.clientY };
  }

  /**
   * Starting the seating over is one action rather than thirty drags. It asks first, since
   * an afternoon's seating is easy to lose and nothing here can be undone from the toast.
   */
  function emptyDesks() {
    const name =
      store.classes.find((cls) => cls.id === classId)?.name ?? "this class";
    if (
      !confirm(
        `Take all ${seated} student${seated === 1 ? "" : "s"} in ${name} out of their desks? The desks stay where they are, and everyone stays on the roster.`,
      )
    )
      return;
    store.unseatClass(classId);
  }

  async function randomlySeatAll() {
    randomizing = true;
    try {
      await store.randomlySeatClass(classId);
    } finally {
      randomizing = false;
    }
  }

  function drop(event: PointerEvent) {
    if (!carry) return;
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const seatId =
      under?.closest<HTMLElement>("[data-seat-id]")?.dataset.seatId;
    if (seatId) store.seatStudent(carry.studentId, seatId);
    else if (under?.closest(".unseated")) store.unseatStudent(carry.studentId);
    carry = null;
  }
</script>

<svelte:window onpointermove={drag} onpointerup={drop} onpointercancel={drop} />

<!-- The class sits on the same row here as it does while teaching, so switching
class is always in the same place just above the room. -->
<div class="seating-bar">
  <label class="class-picker"
    >Class
    <select bind:value={store.activeClassId}>
      {#each store.classes as cls}<option value={cls.id}>{cls.name}</option
        >{/each}
    </select>
  </label>
  <button class="secondary" disabled={!seated} onclick={emptyDesks}
    >Unseat all students</button
  >
</div>

<p class="hint">
  Drag a student onto a desk. Dropping onto a taken desk swaps the two. Dragging
  someone down to the list leaves them on the roster but out of a seat — they
  can still be tapped.
</p>

<div class="seating">
  <div class="unseated">
    <div class="unseated-heading">
      <h2>Not seated <span class="hint">({unseated.length})</span></h2>
      <button
        class="secondary"
        disabled={!students.length || !store.seats.length || randomizing}
        onclick={randomlySeatAll}
      >
        {randomizing ? "Seating…" : "Randomly seat all"}
      </button>
    </div>
    {#if !unseated.length}
      <p class="hint">Everyone has a desk.</p>
    {:else}
      <ul>
        {#each unseated as student (student.id)}
          <li>
            <button
              class="chip"
              onpointerdown={(event) => lift(event, student.id, student.name)}
            >
              {student.name}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <!-- Lifting a seated student is delegated here, since the desks are drawn by SeatCanvas. -->
  <div class="seating-room" onpointerdown={liftFromSeat} role="presentation">
    <SeatCanvas
      compact
      seatLabel={(seat) => ({ text: occupant.get(seat.id)?.name ?? "" })}
    />
  </div>
</div>

{#if carry}
  <div class="carry" style:left="{carry.x}px" style:top="{carry.y}px">
    {carry.name}
  </div>
{/if}
