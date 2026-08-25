import PocketBase from "pocketbase";
import { env } from "$env/dynamic/public";

// The browser talks to PocketBase directly — no proxy routes. See the project's
// PocketBase conventions, and ADR 0001 for why there is a database here at all.
export const pb = new PocketBase(
  env.PUBLIC_POCKETBASE_URL ?? "http://127.0.0.1:8090",
);

pb.autoCancellation(false);
