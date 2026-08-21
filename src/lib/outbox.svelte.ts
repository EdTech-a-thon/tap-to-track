import { pb } from "$lib/pb";

type Op =
  | { kind: "create"; id: string; data: Record<string, unknown> }
  | { kind: "delete"; id: string };

const KEY = "tap-to-track-outbox";
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** PocketBase ids are 15 lowercase alphanumerics, so we can mint one before saving. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

/**
 * Taps are written through here so a dropped connection costs a teacher nothing. The
 * count moves the instant they press; the write is queued and drains when the network
 * comes back. See ADR 0001 — this is the bill for moving off on-device storage.
 */
class Outbox {
  pending = $state<Op[]>([]);
  private draining = false;
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    try {
      this.pending = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    } catch {
      this.pending = [];
    }
    addEventListener("online", () => this.drain());
    setInterval(() => this.drain(), 15_000);
    this.drain();
  }

  private save() {
    localStorage.setItem(KEY, JSON.stringify(this.pending));
  }

  push(op: Op) {
    this.pending = [...this.pending, op];
    this.save();
    this.drain();
  }

  /**
   * Undoing a Tap that never reached the server just drops it from the queue — sending a
   * create and then a delete for a row nobody ever saw would be pointless.
   */
  cancelCreate(id: string): boolean {
    const queued = this.pending.some((op) => op.kind === "create" && op.id === id);
    if (!queued) return false;
    this.pending = this.pending.filter((op) => op.id !== id);
    this.save();
    return true;
  }

  async drain() {
    if (this.draining || !this.pending.length) return;
    this.draining = true;
    try {
      // Sequential, and stops at the first failure so ordering is never scrambled.
      while (this.pending.length) {
        const [next] = this.pending;
        try {
          if (next.kind === "create") await pb.collection("taps").create({ id: next.id, ...next.data });
          else await pb.collection("taps").delete(next.id);
        } catch (error) {
          if (!isMissing(error)) break; // Offline or server trouble: keep it and retry later.
        }
        this.pending = this.pending.slice(1);
        this.save();
      }
    } finally {
      this.draining = false;
    }
  }
}

/** A row that is already gone is not a failure worth retrying forever. */
function isMissing(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  return status === 404 || status === 400;
}

export const outbox = new Outbox();
