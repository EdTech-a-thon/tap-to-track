import { describe, expect, it } from "vitest";
import { groupRequestLanes, requestAlert, unseenRequestIds } from "../src/requestRail";
import type { RequestStatus, RequestType } from "../src/types";

const types: RequestType[] = [
  { id: "help", classId: "c", label: "Help", color: "#fff", behavior: "attention", resolveLabel: "Resolved" },
  { id: "done", classId: "c", label: "Done", color: "#000", behavior: "completion", resolveLabel: "Reviewed" },
];
const request = (id: string, requestTypeId: string, joinedAt: string, status: RequestStatus["status"] = "active"): RequestStatus => ({
  id, requestTypeId, joinedAt, status, studentId: id, behavior: requestTypeId === "help" ? "attention" : "completion",
  acknowledgedAt: null, resolvedAt: null, cancelledAt: null, resolvedBy: null, updatedAt: joinedAt, wait: 0,
});

describe("request rail", () => {
  it("groups requests into lanes and preserves queue order", () => {
    const lanes = groupRequestLanes(types, [request("later", "help", "2026-01-02"), request("done", "done", "2026-01-01"), request("first", "help", "2026-01-01")]);
    expect(lanes[0].requests.map((item) => item.id)).toEqual(["first", "later"]);
    expect(lanes[1].requests.map((item) => item.id)).toEqual(["done"]);
  });

  it("counts only unseen active requests and groups the alert", () => {
    const requests = [request("old", "help", "2026-01-01"), request("new", "help", "2026-01-02"), request("ack", "done", "2026-01-03", "acknowledged")];
    const unseen = unseenRequestIds(requests, new Set(["old"]));
    expect([...unseen]).toEqual(["new"]);
    expect(requestAlert(unseen, groupRequestLanes(types, requests))).toBe("1 new request: 1 Help");
  });

  it("keeps acknowledged requests visible without announcing them as new", () => {
    const acknowledged = request("seen", "help", "2026-01-01", "acknowledged");
    const lanes = groupRequestLanes(types, [acknowledged]);

    expect(lanes[0].requests).toEqual([acknowledged]);
    expect(unseenRequestIds([acknowledged], new Set())).toEqual(new Set());
  });
});
