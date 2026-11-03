import { describe, expect, it } from "vitest";

import type { Permission } from "@/lib/auth/permissions";
import { SIGNED_OUT, type NavContext } from "@/lib/navigation";
import type { PlaylistMonth } from "@/lib/recordings/playlist";
import {
  nextServiceEntries,
  type NextServicePrivate,
  type NextServicePublic,
  type SearchIndex,
  searchSite,
  servicePlanPath,
} from "@/lib/site-search";
import type { Service } from "@/types/song-list";

import { anchorOf, datedServices, nextServiceListenHref, pickNextService } from "./next-service";

function service(id: string, startsAt: string | null, overrides: Partial<Service> = {}): Service {
  const date = id.slice(0, 10);
  return {
    id,
    dateLabel: date,
    serviceLabel: null,
    slot: id.endsWith("-am") ? "AM" : id.endsWith("-pm") ? "PM" : null,
    date,
    startsAt,
    songs: [{ number: "108", title: "Amazing Grace" } as Service["songs"][number]],
    pendingSongs: 0,
    ...overrides,
  };
}

const sunAm = service("2026-11-08-am", "2026-11-08T10:30:00-07:00");
const sunPm = service("2026-11-08-pm", "2026-11-08T18:00:00-07:00");
const wedPm = service("2026-11-11-pm", "2026-11-11T19:00:00-07:00");
const months = [{ services: [sunAm, sunPm, wedPm, service("2026-11-15-am", null, { placeholder: true })] }];

const at = (iso: string) => Date.parse(iso);

function playlists(...ids: string[]): { ok: boolean; months: PlaylistMonth[] } {
  const byMonth = new Map<string, string[]>();
  for (const id of ids) byMonth.set(id.slice(0, 7), [...(byMonth.get(id.slice(0, 7)) ?? []), id]);
  return {
    ok: true,
    months: [...byMonth].map(([month, list]) => ({
      month,
      title: month,
      services: list.map((id) => ({ id, date: id.slice(0, 10), slot: "AM" as const, startsAt: "", title: "", dateLabel: "", items: [] })),
    })),
  };
}

describe("datedServices", () => {
  it("keeps only services with a date and a start, never placeholders", () => {
    expect(datedServices(months).map((s) => s.id)).toEqual(["2026-11-08-am", "2026-11-08-pm", "2026-11-11-pm"]);
  });
});

describe("pickNextService", () => {
  const dated = datedServices(months);

  it("is the next to start", () => {
    expect(pickNextService(dated, at("2026-11-07T12:00:00-07:00"))).toMatchObject({ service: { id: "2026-11-08-am" }, status: "next" });
  });

  it("is the one under way while it is under way", () => {
    expect(pickNextService(dated, at("2026-11-08T11:00:00-07:00"))).toMatchObject({ service: { id: "2026-11-08-am" }, status: "now" });
  });

  it("moves on once a service is over", () => {
    expect(pickNextService(dated, at("2026-11-08T14:00:00-07:00"))).toMatchObject({ service: { id: "2026-11-08-pm" }, status: "next" });
  });

  it("is null with nothing to come", () => {
    expect(pickNextService(dated, at("2026-12-01T00:00:00-07:00"))).toBeNull();
    expect(pickNextService([], Date.now())).toBeNull();
  });
});

describe("nextServiceListenHref", () => {
  it("is the playlist page the Song List's Listen link uses, when the playlists have the service", () => {
    expect(nextServiceListenHref(sunAm, "next", playlists("2026-11-08-am"))).toBe("/playlists/2026-11/2026-11-08-am");
  });

  it("is null while the service is under way or over (as the spotlight hides it)", () => {
    expect(nextServiceListenHref(sunAm, "now", playlists("2026-11-08-am"))).toBeNull();
    expect(nextServiceListenHref(sunAm, "past", playlists("2026-11-08-am"))).toBeNull();
  });

  it("is null for a service with no songs yet", () => {
    expect(nextServiceListenHref({ ...sunAm, songs: [] }, "next", playlists("2026-11-08-am"))).toBeNull();
  });

  it("is null when the playlist page would not find the service - never a guessed link", () => {
    expect(nextServiceListenHref(sunAm, "next", playlists("2026-11-08-pm"))).toBeNull();
    expect(nextServiceListenHref(sunAm, "next", playlists())).toBeNull();
    // The right id under another month is not the same page.
    expect(nextServiceListenHref(sunAm, "next", { ok: true, months: [{ ...playlists("2026-11-08-am").months[0], month: "2026-12" }] })).toBeNull();
  });

  it("is null when the playlists could not be read", () => {
    expect(nextServiceListenHref(sunAm, "next", null)).toBeNull();
    expect(nextServiceListenHref(sunAm, "next", { ...playlists("2026-11-08-am"), ok: false })).toBeNull();
  });
});

describe("anchorOf", () => {
  it("is the service's anchor, or null without a date", () => {
    expect(anchorOf(sunAm)).toBe("2026-11-08-am");
    expect(anchorOf({ date: null, slot: null })).toBeNull();
  });
});

describe("servicePlanPath", () => {
  it("is the planner's page for a real anchor, and nothing for anything else", () => {
    expect(servicePlanPath("2026-11-08-am")).toBe("/service-planner/2026-11-08-am");
    expect(servicePlanPath("2026-11-08")).toBe("/service-planner/2026-11-08");
    expect(servicePlanPath("../admin")).toBeNull();
    expect(servicePlanPath("2026-11-08-am/../../x")).toBeNull();
    expect(servicePlanPath("")).toBeNull();
  });
});

const signedIn = (...permissions: Permission[]): NavContext => ({ signedIn: true, permissions: new Set(permissions) });
const next: NextServicePublic = { anchor: "2026-11-08-am", heading: "Sunday Morning · Nov 8 · 10:30 AM", listenHref: "/playlists/2026-11/2026-11-08-am" };
const mine: NextServicePrivate = { anchor: "2026-11-08-am", sheetMusicHref: "/dashboard/sheet-music/2026-11-08-am" };
const ids = (entries: ReturnType<typeof nextServiceEntries>) => entries.map((entry) => entry.id);

describe("nextServiceEntries", () => {
  it("a visitor is offered Listen only", () => {
    expect(ids(nextServiceEntries(next, null, SIGNED_OUT))).toEqual(["action:next-listen"]);
    // Even handed someone's private links, a visitor is offered nothing from them.
    expect(ids(nextServiceEntries(next, mine, SIGNED_OUT))).toEqual(["action:next-listen"]);
  });

  it("a member with their sheet music: sheet music and Listen, not Plan", () => {
    expect(ids(nextServiceEntries(next, mine, signedIn()))).toEqual(["action:next-sheet-music", "action:next-listen"]);
  });

  it("a planner also gets Plan, at the service's planner page", () => {
    const entries = nextServiceEntries(next, mine, signedIn("manage_service_plans"));
    expect(ids(entries)).toEqual(["action:next-sheet-music", "action:next-listen", "action:next-plan"]);
    expect(entries.find((e) => e.id === "action:next-plan")?.href).toBe("/service-planner/2026-11-08-am");
  });

  it("each names the service, and the sheet music opens in a new tab like the Dashboard's", () => {
    const entries = nextServiceEntries(next, mine, signedIn());
    expect(entries.every((e) => e.detail === next.heading && e.group === "actions")).toBe(true);
    expect(entries.find((e) => e.id === "action:next-sheet-music")).toMatchObject({ href: mine.sheetMusicHref, external: true });
    expect(entries.find((e) => e.id === "action:next-listen")?.external).toBeUndefined();
  });

  it("leaves out a command with nowhere real to go", () => {
    expect(ids(nextServiceEntries({ ...next, listenHref: null }, { ...mine, sheetMusicHref: null }, signedIn()))).toEqual([]);
    expect(ids(nextServiceEntries({ ...next, listenHref: null }, null, signedIn("manage_service_plans")))).toEqual(["action:next-plan"]);
  });

  it("never offers sheet music for a different service than the one called next", () => {
    const stale = { anchor: "2026-11-04-pm", sheetMusicHref: "/dashboard/sheet-music/2026-11-04-pm" };
    expect(ids(nextServiceEntries(next, stale, signedIn()))).toEqual(["action:next-listen"]);
  });

  it("nothing without a next service (or an index from before this existed)", () => {
    expect(nextServiceEntries(null, mine, signedIn("manage_service_plans"))).toEqual([]);
    expect(nextServiceEntries(undefined, mine, signedIn("manage_service_plans"))).toEqual([]);
  });
});

describe("searchSite with the next-service commands", () => {
  const index: SearchIndex = { songs: [], services: [], years: [], pdfs: [], nextService: next };
  const actions = (query: string, context: NavContext, own: NextServicePrivate | null) =>
    searchSite(index, query, false, context, own).groups.find((g) => g.group === "actions")?.entries.map((e) => e.id) ?? [];

  it("leads the actions with nothing typed", () => {
    expect(actions("", signedIn("manage_service_plans"), mine).slice(0, 3)).toEqual([
      "action:next-sheet-music",
      "action:next-listen",
      "action:next-plan",
    ]);
  });

  it("is found by what it does", () => {
    expect(actions("sheet music", signedIn(), mine)).toContain("action:next-sheet-music");
    expect(actions("playlist", SIGNED_OUT, null)).toContain("action:next-listen");
    expect(actions("plan next", signedIn("manage_service_plans"), null)).toContain("action:next-plan");
    expect(actions("plan next", signedIn(), null)).not.toContain("action:next-plan");
  });

  it("leaves the Song List's service entries exactly as they were", () => {
    const withServices: SearchIndex = {
      ...index,
      services: [{ anchor: "2026-11-08-am", heading: next.heading, dateLabel: "Sunday, November 8, 2026", songs: [] }],
    };
    const services = searchSite(withServices, "", false, signedIn(), mine).groups.find((g) => g.group === "services")?.entries;
    expect(services).toEqual([{ id: "service:2026-11-08-am", group: "services", label: next.heading, detail: "", href: "/song-list#2026-11-08-am" }]);
  });
});
