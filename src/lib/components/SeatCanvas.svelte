<script lang="ts">
  import { SEAT_SIZE, fitScale, layoutExtent, placeSeat, seatBounds } from "$lib/domain/seating";
  import { store } from "$lib/store.svelte";
  import type { Seat } from "$lib/domain/types";

  let { snapping = true, draggable = false, fill = false, selectedId = null, seatLabel, onSeatClick }: {
    snapping?: boolean;
    draggable?: boolean;
    /** Grow the desks to fill the space the canvas is given, keeping their shape and spacing. */
    fill?: boolean;
    selectedId?: string | null;
    seatLabel?: (seat: Seat) => { text: string; color?: string; faded?: boolean; strong?: boolean };
    onSeatClick?: (seat: Seat) => void;
  } = $props();

  let dragging = $state<{ id: string; offsetX: number; offsetY: number } | null>(null);
  let room = $state<HTMLDivElement>();
  let box = $state({ width: 0, height: 0 });

  let extent = $derived(layoutExtent(store.seats));
  let bounds = $derived(seatBounds(store.seats));
  // Filling shrink-wraps the room around the desks first, so the empty margins don't take space.
  let size = $derived(fill ? bounds : extent);
  let scale = $derived(fill ? fitScale(bounds, box) : 1);

  /** Where a pointer is in room coordinates, whatever size the room is drawn at. */
  function at(event: PointerEvent) {
    const rect = room!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / scale + (fill ? bounds.x : 0),
      y: (event.clientY - rect.top) / scale + (fill ? bounds.y : 0),
    };
  }

  function start(event: PointerEvent, seat: Seat) {
    if (!draggable) return;
    const spot = at(event);
    dragging = { id: seat.id, offsetX: spot.x - seat.x, offsetY: spot.y - seat.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent) {
    if (!dragging || !room) return;
    const point = at(event);
    const spot = placeSeat(point.x - dragging.offsetX, point.y - dragging.offsetY, snapping);
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

<div class="canvas" class:snapping class:fill
  bind:clientWidth={box.width} bind:clientHeight={box.height}
  style:width={fill ? null : `${extent.width}px`}
  style:height={fill ? null : `${extent.height}px`}>
  <div class="room" bind:this={room}
    style:width="{size.width}px" style:height="{size.height}px"
    style:scale={fill ? scale : null}>
    {#each store.seats as seat (seat.id)}
      {@const label = seatLabel?.(seat)}
      <button
        class="seat"
        data-seat-id={seat.id}
        class:dragging={dragging?.id === seat.id}
        class:selected={selectedId === seat.id}
        class:faded={label?.faded}
        class:empty={!label?.text}
        class:strong={label?.strong}
        style:left="{seat.x - (fill ? bounds.x : 0)}px"
        style:top="{seat.y - (fill ? bounds.y : 0)}px"
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
</div>
