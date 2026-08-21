<script lang="ts">
  import { SEAT_SIZE, layoutExtent, placeSeat } from "$lib/domain/seating";
  import { store } from "$lib/store.svelte";
  import type { Seat } from "$lib/domain/types";

  let { snapping = true, draggable = false, selectedId = null, seatLabel, onSeatClick }: {
    snapping?: boolean;
    draggable?: boolean;
    selectedId?: string | null;
    seatLabel?: (seat: Seat) => { text: string; color?: string; faded?: boolean };
    onSeatClick?: (seat: Seat) => void;
  } = $props();

  let dragging = $state<{ id: string; offsetX: number; offsetY: number } | null>(null);
  let canvas = $state<HTMLDivElement>();

  let extent = $derived(layoutExtent(store.seats));

  function start(event: PointerEvent, seat: Seat) {
    if (!draggable) return;
    const box = canvas!.getBoundingClientRect();
    dragging = {
      id: seat.id,
      offsetX: event.clientX - box.left - seat.x,
      offsetY: event.clientY - box.top - seat.y,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent) {
    if (!dragging || !canvas) return;
    const box = canvas.getBoundingClientRect();
    const spot = placeSeat(
      event.clientX - box.left - dragging.offsetX,
      event.clientY - box.top - dragging.offsetY,
      snapping,
    );
    store.seats = store.seats.map((seat) =>
      seat.id === dragging!.id ? { ...seat, ...spot } : seat);
  }

  function end() {
    if (!dragging) return;
    const seat = store.seats.find((item) => item.id === dragging!.id);
    if (seat) store.moveSeat(seat.id, seat.x, seat.y);
    dragging = null;
  }
</script>

<div class="canvas" bind:this={canvas} class:snapping
  style:width="{extent.width}px" style:height="{extent.height}px">
  {#each store.seats as seat (seat.id)}
    {@const label = seatLabel?.(seat)}
    <button
      class="seat"
      data-seat-id={seat.id}
      class:dragging={dragging?.id === seat.id}
      class:selected={selectedId === seat.id}
      class:faded={label?.faded}
      class:empty={!label?.text}
      style:left="{seat.x}px" style:top="{seat.y}px"
      style:width="{SEAT_SIZE}px" style:height="{SEAT_SIZE}px"
      style:background={label?.color}
      onpointerdown={(event) => start(event, seat)}
      onpointermove={move}
      onpointerup={end}
      onpointercancel={end}
      onclick={() => !dragging && onSeatClick?.(seat)}
    >{label?.text ?? ""}</button>
  {/each}
</div>
