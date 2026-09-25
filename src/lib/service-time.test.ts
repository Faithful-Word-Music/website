import { describe, expect, it } from "vitest";

import {
  formatAgo,
  formatCountdown,
  getTimeline,
  parseDateLabel,
  parseSlot,
} from "@/lib/service-time";

const at = (iso: string) => Date.parse(iso);

describe("parsing", () => {
  it("reads sheet dates by month name", () => {
    expect(parseDateLabel("Wednesday, September 2, 2026")).toBe("2026-09-02");
    expect(parseDateLabel("Sun, Sept 6th, 2026")).toBe("2026-09-06");
    expect(parseDateLabel("Sunday, February 30, 2026")).toBeNull();
    expect(parseDateLabel("Sunday")).toBeNull();
  });

  it("reads service markers loosely", () => {
    expect(parseSlot("PM")).toBe("PM");
    expect(parseSlot("a.m.")).toBe("AM");
    expect(parseSlot("233")).toBeNull();
  });
});

describe("getTimeline", () => {
  const services = [
    { id: "wed", startsAt: "2026-09-23T19:00:00-07:00" },
    { id: "sunAM", startsAt: "2026-09-27T10:30:00-07:00" },
    { id: "sunPM", startsAt: "2026-09-27T18:00:00-07:00" },
    { id: "odd", startsAt: null },
  ];

  it("keeps a service as Next right up to its start", () => {
    const timeline = getTimeline(services, at("2026-09-27T10:29:00-07:00"));
    expect(timeline.nextId).toBe("sunAM");
    expect(timeline.nowId).toBeNull();
    expect(timeline.statusOf("wed")).toBe("past");
    expect(timeline.statusOf("sunPM")).toBe("upcoming");
    expect(timeline.statusOf("odd")).toBe("unknown");
  });

  it("moves Next on the moment a service starts, which becomes Now", () => {
    const timeline = getTimeline(services, at("2026-09-27T10:30:00-07:00"));
    expect(timeline.nowId).toBe("sunAM");
    expect(timeline.nextId).toBe("sunPM");
  });

  it("drops Now once the service is over", () => {
    const timeline = getTimeline(services, at("2026-09-27T12:00:00-07:00"));
    expect(timeline.nowId).toBeNull();
    expect(timeline.statusOf("sunAM")).toBe("past");
    expect(timeline.nextId).toBe("sunPM");
  });

  it("is the same instant for a visitor in any timezone", () => {
    // 10:29 in Arizona is 13:29 in New York; the result must not change.
    const timeline = getTimeline(services, at("2026-09-27T13:29:00-04:00"));
    expect(timeline.nextId).toBe("sunAM");
  });

  it("has no Next once everything has happened", () => {
    expect(getTimeline(services, at("2026-10-01T00:00:00-07:00")).nextId).toBeNull();
  });
});

describe("relative wording", () => {
  it("counts down in minutes, hours, then days", () => {
    const start = "2026-09-27T18:00:00-07:00";
    expect(formatCountdown(start, at("2026-09-27T17:35:00-07:00"))).toBe("in 25 minutes");
    expect(formatCountdown(start, at("2026-09-27T10:00:00-07:00"))).toBe("in 8 hours");
    expect(formatCountdown(start, at("2026-09-26T20:00:00-07:00"))).toBe("tomorrow");
    expect(formatCountdown(start, at("2026-09-24T09:00:00-07:00"))).toBe("in 3 days");
  });

  it("describes the past in calendar terms", () => {
    const now = at("2026-09-24T12:00:00-07:00");
    expect(formatAgo(at("2026-09-24T10:30:00-07:00"), now)).toBe("earlier today");
    expect(formatAgo(at("2026-09-23T19:00:00-07:00"), now)).toBe("yesterday");
    expect(formatAgo(at("2026-09-20T18:00:00-07:00"), now)).toBe("4 days ago");
    expect(formatAgo(at("2026-09-02T19:00:00-07:00"), now)).toBe("3 weeks ago");
    expect(formatAgo(at("2026-03-01T10:30:00-07:00"), now)).toBe("7 months ago");
  });
});
