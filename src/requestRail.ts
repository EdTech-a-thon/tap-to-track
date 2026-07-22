import type { RequestStatus, RequestType } from "./types";

export type RequestLane = RequestType & { requests: RequestStatus[] };

export function groupRequestLanes(
  types: RequestType[],
  requests: RequestStatus[],
): RequestLane[] {
  const lanes = new Map(types.map((type) => [type.id, { ...type, requests: [] as RequestStatus[] }]));
  for (const request of requests) lanes.get(request.requestTypeId)?.requests.push(request);
  for (const lane of lanes.values()) {
    lane.requests.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id));
  }
  return [...lanes.values()];
}

export function unseenRequestIds(
  requests: RequestStatus[],
  seenIds: ReadonlySet<string>,
) {
  return new Set(
    requests
      .filter((request) => request.status === "active" && !seenIds.has(request.id))
      .map((request) => request.id),
  );
}

export function requestAlert(
  newIds: ReadonlySet<string>,
  lanes: RequestLane[],
) {
  const groups = lanes
    .map((lane) => ({ label: lane.label, count: lane.requests.filter((item) => newIds.has(item.id)).length }))
    .filter((group) => group.count > 0);
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  if (!total) return "";
  return `${total} new request${total === 1 ? "" : "s"}: ${groups.map((group) => `${group.count} ${group.label}`).join(", ")}`;
}
