<script lang="ts">
  import {
    GRID, SEAT_SIZE, canvasBounds, fitScale, placeSeat, roomBounds, sizeAnchor,
  } from "$lib/domain/seating";
  import { store } from "$lib/store.svelte";
  import type { Anchor, Seat } from "$lib/domain/types";

  /** What the teacher has picked up: a desk to move, an Anchor to move, or its corner. */
  type Grab =
    | { kind: "seat" | "anchor"; id: string; offsetX: number; offsetY: number }
    | { kind: "size"; id: string };

  let { snapping = true, draggable = false, fill = false, compact = false, selected = null,
    seatLabel, onSeatClick, onAnchorClick }: {
    snapping?: boolean;
    draggable?: boolean;
    /** Grow the desks to fill the space the canvas is given, keeping their shape and spacing. */
    fill?: boolean;
    /** Keep the read-only chart close to its furniture instead of showing the editing floor. */
    compact?: boolean;
    /** The one piece of furniture being worked on, whichever kind it is. */
    selected?: { kind: "seat" | "anchor"; id: string } | null;
    seatLabel?: (seat: Seat) => { text: string; color?: string; faded?: boolean; strong?: boolean };
    onSeatClick?: (seat: Seat) => void;
    onAnchorClick?: (anchor: Anchor) => void;
  } = $props();

  let dragging = $state<Grab | null>(null);
  let dragFloor = $state<ReturnType<typeof canvasBounds> | null>(null);
  let room = $state<HTMLDivElement>();
  let box = $state({ width: 0, height: 0 });

  let bounds = $derived(roomBounds(store.seats, store.anchors));
  let floor = $derived(
    dragFloor ??
      (compact
        ? roomBounds(store.seats, store.anchors, GRID)
        : canvasBounds(store.seats, store.anchors)),
  );
  // Filling shrink-wraps the room around the furniture first, so the empty margins don't take space.
  let size = $derived(fill ? bounds : floor);
  let scale = $derived(fill ? fitScale(bounds, box) : 1);

  /** Where a pointer is in room coordinates, whatever size the room is drawn at. */
  function at(event: PointerEvent) {
    const rect = room!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / scale + (fill ? bounds.x : floor.x),
      y: (event.clientY - rect.top) / scale + (fill ? bounds.y : floor.y),
    };
  }

  function hold(event: PointerEvent, held: Grab) {
    if (!draggable) return;
    dragFloor = canvasBounds(store.seats, store.anchors);
    dragging = held;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  /** Picking a thing up remembers where in it the finger landed, so it doesn't jump. */
  function lift(event: PointerEvent, kind: "seat" | "anchor", piece: { id: string; x: number; y: number }) {
    const spot = at(event);
    hold(event, { kind, id: piece.id, offsetX: spot.x - piece.x, offsetY: spot.y - piece.y });
  }

  function move(event: PointerEvent) {
    if (!dragging || !room) return;
    const point = at(event);
    if (dragging.kind === "size") {
      // The corner is dragged, so the far edges follow the pointer and the origin stays put.
      const anchor = store.anchors.find((item) => item.id === dragging!.id);
      if (!anchor) return;
      const next = sizeAnchor(point.x - anchor.x, point.y - anchor.y, snapping);
      store.anchors = store.anchors.map((item) =>
        (item.id === anchor.id ? { ...item, ...next } : item));
      return;
    }
    // Anchors land by the same rule as desks; negative positions extend the room.
    const spot = placeSeat(point.x - dragging.offsetX, point.y - dragging.offsetY, snapping);
    if (dragging.kind === "seat") {
      store.seats = store.seats.map((seat) =>
        seat.id === dragging!.id ? { ...seat, ...spot } : seat);
    } else {
      store.anchors = store.anchors.map((anchor) =>
        anchor.id === dragging!.id ? { ...anchor, ...spot } : anchor);
    }
  }

  /** Dragging moves the furniture on screen as it goes; letting go is what writes it down. */
  function end() {
    if (!dragging) return;
    if (dragging.kind === "seat") {
      const seat = store.seats.find((item) => item.id === dragging!.id);
      if (seat) store.moveSeat(seat.id, seat.x, seat.y);
    } else {
      const anchor = store.anchors.find((item) => item.id === dragging!.id);
      if (anchor) {
        store.updateAnchor(anchor.id, {
          x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height,
        });
      }
    }
    dragging = null;
    dragFloor = null;
  }

  let held = $derived(dragging && dragging.kind !== "size" ? dragging.id : null);
</script>

<div class="canvas" class:snapping class:fill
  bind:clientWidth={box.width} bind:clientHeight={box.height}
  style:width={fill ? null : `${floor.width}px`}
  style:height={fill ? null : `${floor.height}px`}>
  <div class="room" bind:this={room}
    style:width="{size.width}px" style:height="{size.height}px"
    style:scale={fill ? scale : null}>
    <!-- Anchors are drawn under the desks: they are the room, not the furniture in it. -->
    {#each store.anchors as anchor (anchor.id)}
      {@const chosen = selected?.kind === "anchor" && selected.id === anchor.id}
      <div class="anchor" class:movable={draggable} class:dragging={held === anchor.id}
        class:selected={chosen} class:blank={!anchor.label.trim()}
        style:left="{anchor.x - (fill ? bounds.x : floor.x)}px"
        style:top="{anchor.y - (fill ? bounds.y : floor.y)}px"
        style:width="{anchor.width}px" style:height="{anchor.height}px">
        <!-- Anchors are furniture, not controls: outside the layout editor they are not
        something to tab to, and nothing happens if you reach one. -->
        <button class="anchor-face" tabindex={draggable ? 0 : -1}
          onpointerdown={(event) => lift(event, "anchor", anchor)}
          onpointermove={move}
          onpointerup={end}
          onpointercancel={end}
          onclick={() => !dragging && onAnchorClick?.(anchor)}
        >{anchor.label.trim() || "Anchor"}</button>
        {#if chosen && draggable}
          <button class="anchor-size" aria-label="Resize {anchor.label || 'this anchor'}"
            onpointerdown={(event) => hold(event, { kind: "size", id: anchor.id })}
            onpointermove={move}
            onpointerup={end}
            onpointercancel={end}
          ></button>
        {/if}
      </div>
    {/each}

    {#each store.seats as seat (seat.id)}
      {@const label = seatLabel?.(seat)}
      <button
        class="seat"
        data-seat-id={seat.id}
        class:dragging={held === seat.id}
        class:selected={selected?.kind === "seat" && selected.id === seat.id}
        class:faded={label?.faded}
        class:empty={!label?.text}
        class:strong={label?.strong}
        style:left="{seat.x - (fill ? bounds.x : floor.x)}px"
        style:top="{seat.y - (fill ? bounds.y : floor.y)}px"
        style:width="{SEAT_SIZE}px" style:height="{SEAT_SIZE}px"
        style:background={label?.color}
        onpointerdown={(event) => lift(event, "seat", seat)}
        onpointermove={move}
        onpointerup={end}
        onpointercancel={end}
        onclick={() => !dragging && onSeatClick?.(seat)}
      >{label?.text ?? ""}</button>
    {/each}
  </div>
</div>
