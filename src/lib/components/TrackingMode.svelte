<script lang="ts">
  import HighlightPicker from "$lib/components/HighlightPicker.svelte";
  import SeatCanvas from "$lib/components/SeatCanvas.svelte";
  import TapPopup from "$lib/components/TapPopup.svelte";
  import { unseatedIn } from "$lib/domain/assignment";
  import { seatShade } from "$lib/domain/highlight";
  import { today } from "$lib/domain/taps";
  import { store } from "$lib/store.svelte";
  import OutboxBadge from "$lib/components/OutboxBadge.svelte";
  import { enterTeaching, leaveTeaching, ui } from "$lib/ui.svelte";
  import type { Student } from "$lib/domain/types";

  let { classId }: { classId: string } = $props();

  let open = $state<Student | null>(null);
  let highlightId = $state<string | null>(null);

  // The Highlight is a per-Class habit, so each class opens showing what matters in it.
  const remembered = (id: string) => `tap-to-track-highlight-${id}`;
  $effect(() => {
    highlightId = localStorage.getItem(remembered(classId));
  });
  function remember(id: string | null) {
    if (id) localStorage.setItem(remembered(classId), id);
    else localStorage.removeItem(remembered(classId));
  }

  let students = $derived(store.studentsIn(classId));
  let unseated = $derived(unseatedIn(store.students, classId));
  let occupant = $derived(new Map(students.filter((s) => s.seatId).map((s) => [s.seatId, s])));
  // Counts and toggles cover today, so a tap is recorded the moment it happens.
  let day = today();

  function pick(student: Student | undefined) {
    if (student) open = student;
  }

  /** An invisible exit strands a teacher in front of thirty children. Escape always works. */
  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape" && ui.teaching) leaveTeaching();
  }

  let highlight = $derived(store.behaviors.find((behavior) => behavior.id === highlightId) ?? null);

  function shade(student: Student | undefined) {
    if (!student) return { away: false } as ReturnType<typeof seatShade>;
    return seatShade(store.chartTaps(classId), day, student.id, highlight, store.behaviors);
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="tracking" class:teaching={ui.teaching}>
  <div class="tracking-bar">
    <div class="bar-side"></div>

    <div class="bar-center">
      <label class="class-picker">Class
        <select bind:value={store.activeClassId}>
          {#each store.classes as cls}<option value={cls.id}>{cls.name}</option>{/each}
        </select>
      </label>
      <!-- Choosing what the colors show and clearing them are the same errand, so they
      sit in one group. Resetting asks nothing first: only the colors go, and every tap
      stays in the reports. -->
      <div class="display-group">
        <HighlightPicker {classId} bind:value={
          () => highlightId,
          (next) => { highlightId = next; remember(next); }
        } />
        <button class="secondary" onclick={() => store.clearChart(classId)}>
          Reset desk colors
        </button>
      </div>
    </div>

    <div class="bar-end">
      {#if ui.teaching}
        <OutboxBadge />
        <button class="leave" onclick={leaveTeaching}>Exit full screen</button>
      {:else}
        <button class="primary" onclick={enterTeaching}>Full screen</button>
      {/if}
    </div>
  </div>

  <SeatCanvas
    fill
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
