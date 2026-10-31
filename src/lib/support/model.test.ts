import { describe, expect, it } from "vitest";

import { contextLinks, parseContextInput, redactContext, type SupportContext } from "./context";
import {
  CATEGORY_KEYS,
  REQUEST_TYPES,
  applyWorkflow,
  canMove,
  categoriesFor,
  diffWorkflow,
  newPublicId,
  parseKey,
  parseLink,
  parseLinks,
  parsePublicId,
  parseText,
  parseTitle,
  workflowAfterReply,
  type Workflow,
} from "./model";

const open: Workflow = { status: "open", waitingOn: "management", priority: "normal", assigneeId: null };

describe("kinds of request", () => {
  it("puts all twelve categories under the four ways in", () => {
    expect(CATEGORY_KEYS).toHaveLength(12);
    expect(REQUEST_TYPES.flatMap(categoriesFor).sort()).toEqual([...CATEGORY_KEYS].sort());
    expect(categoriesFor("problem")).toContain("wrong_key");
    expect(categoriesFor("sheet_music")).toEqual(["missing_sheet_music", "new_sheet_music"]);
  });
});

describe("the lifecycle", () => {
  it("lets managers close anything and reopen only into Open", () => {
    expect(canMove("open", "closed")).toBe(true);
    expect(canMove("resolved", "open")).toBe(true);
    expect(canMove("closed", "open")).toBe(true);
    expect(canMove("closed", "resolved")).toBe(false);
    expect(canMove("resolved", "in_progress")).toBe(false);
  });

  it("clears waiting-on when a request leaves the active statuses, and waits on management when reopened", () => {
    const resolved = applyWorkflow({ ...open, waitingOn: "submitter" }, { status: "resolved" })!;
    expect(resolved).toMatchObject({ status: "resolved", waitingOn: "none" });
    expect(applyWorkflow(resolved, { status: "open" })).toMatchObject({ status: "open", waitingOn: "management" });
    expect(applyWorkflow({ ...open, status: "closed", waitingOn: "none" }, { status: "resolved" })).toBeNull();
  });

  it("records one event per change, naming resolving, closing and reopening as such", () => {
    expect(diffWorkflow(open, { ...open, status: "resolved", waitingOn: "none" })).toEqual([{ kind: "resolved", from: "open", to: "resolved" }]);
    expect(diffWorkflow({ ...open, status: "closed", waitingOn: "none" }, open)).toEqual([
      { kind: "reopened", from: "closed", to: "open" },
      { kind: "waiting_changed", from: "none", to: "management" },
    ]);
    expect(diffWorkflow(open, { ...open, priority: "urgent", assigneeId: "user_a" })).toEqual([
      { kind: "assigned", from: null, to: "user_a" },
      { kind: "priority_changed", from: "normal", to: "urgent" },
    ]);
    expect(diffWorkflow(open, open)).toEqual([]);
  });
});

describe("replies", () => {
  it("puts a submitter's reply back with management", () => {
    expect(workflowAfterReply({ ...open, waitingOn: "submitter" }, { by: "submitter", reopen: false })).toMatchObject({ waitingOn: "management" });
  });

  it("reopens a resolved request only when the submitter says so, and never a closed one", () => {
    const resolved: Workflow = { ...open, status: "resolved", waitingOn: "none" };
    expect(workflowAfterReply(resolved, { by: "submitter", reopen: false })).toEqual(resolved);
    expect(workflowAfterReply(resolved, { by: "submitter", reopen: true })).toMatchObject({ status: "open", waitingOn: "management" });
    expect(workflowAfterReply({ ...resolved, status: "closed" }, { by: "submitter", reopen: true })).toBeNull();
    expect(workflowAfterReply(open, { by: "submitter", reopen: true })).toBeNull();
  });

  it("lets a manager ask for information, resolve, or simply answer", () => {
    expect(workflowAfterReply(open, { by: "manager", visibility: "public", after: "request_info" })).toMatchObject({ waitingOn: "submitter" });
    expect(workflowAfterReply(open, { by: "manager", visibility: "public", after: "resolve" })).toMatchObject({ status: "resolved", waitingOn: "none" });
    expect(workflowAfterReply(open, { by: "manager", visibility: "public", after: "keep" })).toMatchObject({ waitingOn: "none" });
  });

  it("moves nothing for an internal note, and allows one on a closed request where a public reply is refused", () => {
    const closed: Workflow = { ...open, status: "closed", waitingOn: "none" };
    expect(workflowAfterReply(open, { by: "manager", visibility: "internal" })).toEqual(open);
    expect(workflowAfterReply(closed, { by: "manager", visibility: "internal" })).toEqual(closed);
    expect(workflowAfterReply(closed, { by: "manager", visibility: "public", after: "keep" })).toBeNull();
  });
});

describe("what may be sent", () => {
  it("tidies titles and text, and refuses empty or overlong ones", () => {
    expect(parseTitle("  Wrong   key \n")).toBe("Wrong key");
    expect(parseTitle("")).toBeNull();
    expect(parseTitle("x".repeat(121))).toBeNull();
    expect(parseText("a\r\n\r\n\r\n\r\nb", 100)).toBe("a\n\nb");
    expect(parseText("x".repeat(101), 100)).toBeNull();
  });

  it("accepts only http(s) links without credentials", () => {
    expect(parseLink("https://example.com/a b")).toBe("https://example.com/a%20b");
    expect(parseLink("javascript:alert(1)")).toBeNull();
    expect(parseLink("data:text/html,hi")).toBeNull();
    expect(parseLink("https://user:pass@example.com")).toBeNull();
    expect(parseLink("ftp://example.com")).toBeNull();
    expect(parseLinks(["", "https://a.example", "https://a.example"])).toEqual(["https://a.example/"]);
    expect(parseLinks(["https://a.example", "https://b.example", "https://c.example", "https://d.example"])).toBeNull();
    expect(parseLinks(["https://a.example", "nope"])).toBeNull();
  });

  it("accepts only real idempotency keys and request IDs", () => {
    expect(parseKey("6F9619FF-8B86-4D01-B42D-00C04FC964FF")).toBe("6f9619ff-8b86-4d01-b42d-00c04fc964ff");
    expect(parseKey("not-a-key")).toBeNull();
    expect(parsePublicId(" r-7k3f9q2m ")).toBe("R-7K3F9Q2M");
    expect(parsePublicId("R-7K3F9Q2I")).toBeNull();
    expect(parsePublicId("../admin")).toBeNull();
  });

  it("makes request IDs that read back as themselves", () => {
    const id = newPublicId((bytes) => Uint8Array.from({ length: bytes }, (_, index) => index * 37));
    expect(id).toMatch(/^R-[0-9A-Z]{8}$/);
    expect(parsePublicId(id)).toBe(id);
  });
});

describe("context references", () => {
  it("keeps only what the category takes, and drops anything malformed", () => {
    expect(parseContextInput("wrong_key", { service: "2026-11-08-am", position: 2, songId: "BTH-001", page: "/x" })).toEqual({
      service: "2026-11-08-am",
      position: 2,
      songId: "BTH-001",
    });
    expect(parseContextInput("question", { service: "2026-11-08-am", songId: "BTH-001" })).toEqual({});
    expect(parseContextInput("wrong_key", { service: "2026-11-08-am'; drop", placeId: "p1" })).toEqual({});
    expect(parseContextInput("website_bug", { page: "https://evil.example/" })).toEqual({});
    expect(parseContextInput("website_bug", { page: "/song-list" })).toEqual({ page: "/song-list" });
    expect(parseContextInput("leader_assignment", { service: "2026-11-08-pm", leadership: true })).toEqual({
      service: "2026-11-08-pm",
      leadership: true,
    });
  });

  const draft: SupportContext = {
    v: 1,
    restricted: true,
    service: { anchor: "2026-11-08-am", date: "2026-11-08", slot: "AM", label: "Missions", startsAt: null, state: "draft", planRevision: 4 },
    place: { placeId: "p2", position: 2, song: { songId: "BTH-001", title: "Draft Song", number: "1", collection: "BTH" } },
    leadership: { revision: 3, positions: [2] },
  };

  it("hides an unpublished service's songs and leaders from a reader who could not see them", () => {
    const hidden = redactContext(draft, () => false, false);
    expect(JSON.stringify(hidden)).not.toContain("Draft Song");
    expect(JSON.stringify(hidden)).not.toContain("Missions");
    expect(hidden.leadership).toBeUndefined();
    expect(hidden.redacted).toBe(true);
    expect(redactContext(draft, (permission) => permission === "manage_service_plans", false)).toBe(draft);
    expect(redactContext(draft, () => false, true)).toBe(draft);
  });

  it("links only to this site's own pages, and to the planner only for planners", () => {
    const links = contextLinks(
      { ...draft, service: { ...draft.service!, state: "published" }, restricted: false },
      () => false,
      () => "draft-song-bth-001",
    );
    expect(links.map((link) => link.href)).toEqual(["/song-list#2026-11-08-am", "/library/songs/draft-song-bth-001"]);
    expect(contextLinks(draft, (permission) => permission === "manage_service_plans", () => null).map((link) => link.kind)).toEqual(["planner"]);
  });
});
