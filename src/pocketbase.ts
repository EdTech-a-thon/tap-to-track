import PocketBase, { type RecordModel } from "pocketbase";

const configuredUrl = import.meta.env.VITE_POCKETBASE_URL?.trim();

/** The one shared browser client used for auth, records, files, and live updates. */
export const pb = new PocketBase(configuredUrl || window.location.origin);

export function currentTeacherId() {
  return pb.authStore.record?.id ?? "";
}

export function ownedClassFilter(classId?: string) {
  const parts = [`owner = "${currentTeacherId()}"`];
  if (classId) parts.push(`id = "${classId}"`);
  return parts.join(" && ");
}

export function fileUrl(record: RecordModel, filename: string) {
  return pb.files.getURL(record, filename);
}
