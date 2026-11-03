import { describe, expect, it } from "vitest";

import type { LeadershipProblem } from "@/lib/leadership/board";

import type { ComingUpService, ComingUpSong } from "./coming-up";
import type { PlannerWork } from "./providers";
import { serviceReadiness } from "./readiness";

const DAY = 86_400_000;
const now = Date.parse("2026-11-02T12:00:00-08:00");
const inDays = (days: number) => new Date(now + days * DAY).toISOString();

function song(sheet: ComingUpSong["sheet"] = null): ComingUpSong {
  return { title: "Amazing Grace", number: "245", key: "G", sheet };
}

function service(overrides: Partial<ComingUpService> = {}): Pick<ComingUpService, "id" | "startsAt" | "slots" | "sheetMusicChecked"> {
  return { id: "2026-11-08-am", startsAt: inDays(6), slots: [song(), song(), song()], sheetMusicChecked: false, ...overrides };
}

function work(overrides: Partial<PlannerWork> = {}): PlannerWork {
  return { anchor: "2026-11-08-am", slot: "AM", startsAt: inDays(6), label: null, status: "draft", filled: 3, target: 5, ...overrides };
}

function problem(overrides: Partial<LeadershipProblem> = {}): LeadershipProblem {
  return { anchor: "2026-11-08-am", startsAt: inDays(6), label: null, slot: "AM", unled: 0, conflicts: [], ineligible: [], ...overrides };
}

const found = { status: "found" as const, shown: { label: "Standard", href: "/a" }, alternatives: [] };

describe("serviceReadiness", () => {
  it("has nothing to say to someone who neither plans nor has sheet music types", () => {
    expect(serviceReadiness({ service: service(), now })).toBeNull();
  });

  it("is ready for a planner when the service is published, full and led", () => {
    const result = serviceReadiness({ service: service(), now, planner: { work: [], problems: [] } });
    expect(result?.overall).toBe("ready");
    expect(result?.signals.map((signal) => [signal.key, signal.state])).toEqual([
      ["songs-posted", "ok"],
      ["songs-chosen", "ok"],
      ["leaders", "ok"],
    ]);
  });

  it("needs attention for a draft a week away, and blocks one within three days", () => {
    const week = serviceReadiness({ service: service({ slots: [] }), now, planner: { work: [work()], problems: [] } });
    expect(week?.overall).toBe("attention");
    expect(week?.signals.find((signal) => signal.key === "songs-chosen")?.label).toBe("3 of 5 songs chosen");

    const close = serviceReadiness({
      service: service({ slots: [], startsAt: inDays(2) }),
      now,
      planner: { work: [work({ startsAt: inDays(2) })], problems: [] },
    });
    expect(close?.overall).toBe("blocked");
    expect(close?.signals[0]).toMatchObject({ key: "songs-posted", state: "blocked", href: "/service-planner/2026-11-08-am" });
  });

  it("never reads as ready when a source failed to load", () => {
    const failedQueue = serviceReadiness({ service: service(), now, planner: { work: null, problems: [] } });
    expect(failedQueue?.overall).toBe("unknown");
    const failedLeaders = serviceReadiness({ service: service(), now, planner: { work: [], problems: null } });
    expect(failedLeaders?.overall).toBe("unknown");
  });

  it("names every leader problem on the service", () => {
    const result = serviceReadiness({
      service: service(),
      now,
      planner: { work: [], problems: [problem({ unled: 2, conflicts: [{ name: "Brian", positions: [3] }] })] },
    });
    expect(result?.overall).toBe("attention");
    expect(result?.signals.find((signal) => signal.key === "leaders")?.label).toBe("2 songs have no leader · Brian is leading but unavailable");
  });

  it("makes no claim about leaders beyond the window their problems cover", () => {
    const result = serviceReadiness({ service: service({ startsAt: inDays(20) }), now, planner: { work: [], problems: [] } });
    expect(result?.signals.map((signal) => signal.key)).not.toContain("leaders");
  });

  it("counts the viewer's songs without their sheet music", () => {
    const missing = { status: "missing" as const };
    const result = serviceReadiness({
      service: service({ sheetMusicChecked: true, slots: [song(found), song(missing), null, song(missing)] }),
      now,
    });
    expect(result).toEqual({
      overall: "attention",
      signals: [{ key: "my-sheet-music", state: "attention", label: "2 songs have none of your sheet music" }],
    });
    const ready = serviceReadiness({ service: service({ sheetMusicChecked: true, slots: [song(found)] }), now });
    expect(ready?.overall).toBe("ready");
  });

  it("does not check sheet music before the songs are posted", () => {
    expect(serviceReadiness({ service: service({ sheetMusicChecked: true, slots: [] }), now })).toBeNull();
  });
});
