import { describe, expect, it } from "vitest";

import { DEFAULT_ROLES, resolvePermissions, type Permission } from "@/lib/auth/permissions";
import { SIGNED_OUT, type NavContext } from "@/lib/navigation";
import { askConductorEntry, MAX_SONGS, offeredTo, type SearchEntry, type SearchIndex, searchSite, serviceAnchor } from "@/lib/site-search";

const index: SearchIndex = {
  songs: [
    { slug: "amazing-grace", title: "Amazing Grace", number: "108", sheetMusic: true },
    { slug: "great-is-thy-faithfulness", title: "Great Is Thy Faithfulness", number: "441", sheetMusic: false },
    { slug: "how-great-thou-art", title: "How Great Thou Art", number: null, sheetMusic: false },
    { slug: "wonderful-grace-of-jesus", title: "Wonderful Grace of Jesus", number: "210", sheetMusic: false },
    { slug: "the-44th-hymn", title: "The Forty-Fourth", number: "44", sheetMusic: false },
  ],
  services: [
    {
      anchor: "2026-09-30-pm",
      heading: "Wednesday Evening · Sept 30 · 7:00 PM",
      dateLabel: "Wednesday, September 30, 2026",
      songs: [{ number: "210", title: "Wonderful Grace of Jesus" }],
    },
    {
      anchor: "2026-10-04-am",
      heading: "Sunday Morning · Oct 4 · 10:30 AM",
      dateLabel: "Sunday, October 4, 2026",
      songs: [{ number: "441", title: "Great Is Thy Faithfulness" }],
    },
  ],
  years: [2026, 2025],
  pdfs: [{ month: "October", href: "/song-list/pdf/october" }],
};

function labels(query: string, group: string) {
  return searchSite(index, query, false).groups.find((g) => g.group === group)?.entries.map((e) => e.label) ?? [];
}

describe("serviceAnchor", () => {
  it("is made from the date and time of day", () => {
    expect(serviceAnchor("2026-09-30", "PM")).toBe("2026-09-30-pm");
    expect(serviceAnchor("2026-09-30", null)).toBe("2026-09-30");
  });
});

describe("searchSite", () => {
  it("opens on the coming services, pages and actions, without songs", () => {
    const groups = searchSite(index, "", false).groups.map((g) => g.group);
    expect(groups).toEqual(["services", "pages", "actions"]);
    // Year recaps wait to be searched for.
    expect(labels("", "pages")).not.toContain("2026 in songs");
  });

  it("finds songs by title, starting matches first", () => {
    expect(labels("great", "songs")).toEqual(["Great Is Thy Faithfulness", "How Great Thou Art"]);
  });

  it("finds songs by hymn number, the exact number first", () => {
    expect(labels("44", "songs")).toEqual(["The Forty-Fourth", "Great Is Thy Faithfulness"]);
    expect(labels("#441", "songs")).toEqual(["Great Is Thy Faithfulness"]);
  });

  it("finds a service by a song in it, and by its date", () => {
    expect(labels("grace of jesus", "services")).toEqual(["Wednesday Evening · Sept 30 · 7:00 PM"]);
    expect(labels("oct 4", "services")).toEqual(["Sunday Morning · Oct 4 · 10:30 AM"]);
    expect(labels("october", "services")).toEqual(["Sunday Morning · Oct 4 · 10:30 AM"]);
  });

  it("finds pages and actions by their keywords", () => {
    expect(labels("archive", "pages")[0]).toBe("Song archive");
    expect(labels("2025", "pages")).toEqual(["2025 in songs"]);
    expect(labels("dark", "actions")).toEqual(["Switch to dark mode"]);
    expect(labels("pdf", "actions")).toEqual(["October song list as a PDF"]);
  });

  it("names the theme it would switch to", () => {
    const actions = searchSite(index, "theme", true).groups.find((g) => g.group === "actions");
    expect(actions?.entries.map((e) => e.label)).toEqual(["Switch to light mode"]);
  });

  it("shows a limited number of songs and counts the rest", () => {
    const many: SearchIndex = {
      ...index,
      songs: Array.from({ length: MAX_SONGS + 3 }, (_, i) => ({
        slug: `hymn-${i}`,
        title: `Hymn ${i}`,
        number: null,
        sheetMusic: false,
      })),
    };
    const results = searchSite(many, "hymn", false);
    expect(results.groups[0].entries).toHaveLength(MAX_SONGS);
    expect(results.moreSongs).toBe(3);
  });

  it("still finds pages before the index has loaded", () => {
    expect(searchSite(null, "contact", false).groups.map((g) => g.group)).toEqual(["pages", "actions"]);
  });
});

// ---------------------------------------------------------------------------
// Who is offered what. People are made from the site's starting roles, and
// from single permissions - what is offered follows the permissions, whatever
// role they came by.
// ---------------------------------------------------------------------------

const rolePermissions = new Map(DEFAULT_ROLES.map((role) => [role.key, role.permissions as string[]]));

function person(roleKeys: string[], grants: Permission[] = [], denies: Permission[] = []): NavContext {
  const permissions = resolvePermissions(roleKeys, rolePermissions, [
    ...grants.map((permission) => ({ permission, effect: "grant" as const })),
    ...denies.map((permission) => ({ permission, effect: "deny" as const })),
  ]);
  return { signedIn: true, permissions };
}

const member = person([]);
const musician = person(["musician"]);
const songLeader = person(["song_leader"]);
const director = person(["music_director"]);
const administrator = person(["administrator"]);

/** Everything a person could ever be shown: the opening list, and every entry a query could find. */
function everything(context: NavContext): SearchEntry[] {
  const opening = searchSite(index, "", false, context).groups.flatMap((group) => group.entries);
  // "a" and "e" between them are in every label, so nothing that needs typing for is missed.
  const typed = ["a", "e", "i", "o", "admin", "ai"].flatMap((query) => searchSite(index, query, false, context).groups.flatMap((group) => group.entries));
  return [...new Map([...opening, ...typed].map((entry) => [entry.id, entry])).values()];
}

const pagesOf = (context: NavContext) => everything(context).filter((entry) => entry.group === "pages").map((entry) => entry.href!);
const commandsOf = (context: NavContext) => everything(context).flatMap((entry) => (entry.action ? [entry.action] : []));
const finds = (context: NavContext, query: string) => searchSite(index, query, false, context).groups.flatMap((group) => group.entries.map((entry) => entry.label));

const PLANNER = ["/service-planner", "/service-planner/inserts"];
const ADMIN = ["/admin", "/admin/requests", "/admin/invitations", "/admin/users", "/admin/roles", "/admin/configuration", "/admin/ai", "/admin/ai/memory", "/admin/ai/philosophy"];
const RESTRICTED = [...PLANNER, "/conductor", "/availability", ...ADMIN];

describe("who the search offers what", () => {
  it("offers a visitor the public site and nothing of the signed-in one", () => {
    const pages = pagesOf(SIGNED_OUT);
    expect(pages).toContain("/");
    expect(pages).toContain("/song-list");
    expect(pages).toContain("/song-list/archive/services");
    for (const href of [...RESTRICTED, "/dashboard", "/profile", "/account"]) expect(pages).not.toContain(href);
    expect(commandsOf(SIGNED_OUT)).toEqual(["toggle-theme"]);
  });

  it("offers a Member their own pages, and none of the restricted ones or commands", () => {
    const pages = pagesOf(member);
    for (const href of ["/dashboard", "/profile", "/account", "/song-list", "/library"]) expect(pages).toContain(href);
    expect(pages).not.toContain("/");
    for (const href of RESTRICTED) expect(pages).not.toContain(href);
    expect(commandsOf(member)).toEqual(["toggle-theme"]);
    expect(finds(member, "When did we last sing Amazing Grace?")).toEqual([]);
  });

  it("offers a Musician Availability and its command, but not Conductor, the Service Planner or Admin", () => {
    for (const who of [musician, songLeader]) {
      const pages = pagesOf(who);
      expect(pages).toContain("/availability");
      for (const href of [...PLANNER, "/conductor", ...ADMIN]) expect(pages).not.toContain(href);
      expect(commandsOf(who).sort()).toEqual(["toggle-theme", "update-availability"]);
    }
  });

  it("offers the Music Director every tool that role's permissions open", () => {
    const pages = pagesOf(director);
    for (const href of [...PLANNER, "/conductor", "/availability", "/admin", "/admin/users", "/admin/configuration", "/admin/ai", "/admin/ai/memory", "/admin/ai/philosophy"]) {
      expect(pages).toContain(href);
    }
    // Not the parts of Admin that role does not manage.
    for (const href of ["/admin/requests", "/admin/invitations", "/admin/roles"]) expect(pages).not.toContain(href);
    expect(commandsOf(director).sort()).toEqual(["ask-conductor", "toggle-theme", "update-availability"]);
  });

  it("offers an Administrator everything", () => {
    const pages = pagesOf(administrator);
    for (const href of RESTRICTED) expect(pages).toContain(href);
  });

  it("follows the permission, not the role: one granted or taken away changes exactly its own entries", () => {
    // A Musician given AI: Conductor and its Admin pages appear, and nothing of the planner.
    const withAi = person(["musician"], ["use_ai"]);
    expect(pagesOf(withAi)).toEqual(expect.arrayContaining(["/conductor", "/admin", "/admin/ai", "/admin/ai/memory", "/admin/ai/philosophy"]));
    for (const href of [...PLANNER, "/admin/roles", "/admin/users"]) expect(pagesOf(withAi)).not.toContain(href);
    expect(commandsOf(withAi)).toContain("ask-conductor");

    // A Music Director with AI taken away: those go, and the rest stays.
    const withoutAi = person(["music_director"], [], ["use_ai"]);
    for (const href of ["/conductor", "/admin/ai", "/admin/ai/memory", "/admin/ai/philosophy"]) expect(pagesOf(withoutAi)).not.toContain(href);
    expect(pagesOf(withoutAi)).toEqual(expect.arrayContaining([...PLANNER, "/availability", "/admin/users"]));
    expect(commandsOf(withoutAi)).not.toContain("ask-conductor");

    // And with availability taken away: the page and the command both go.
    const noAvailability = person(["music_director"], [], ["view_availability"]);
    expect(pagesOf(noAvailability)).not.toContain("/availability");
    expect(commandsOf(noAvailability)).not.toContain("update-availability");

    // A Member given only the planner: the planner, and still no Admin (it opens none of it).
    const planner = person([], ["manage_service_plans"]);
    expect(pagesOf(planner)).toEqual(expect.arrayContaining(PLANNER));
    for (const href of ["/conductor", "/availability", ...ADMIN]) expect(pagesOf(planner)).not.toContain(href);
  });

  it("never offers a restricted page to someone lacking its permission, whoever they are", () => {
    const needs: Record<string, Permission[]> = {
      "/service-planner": ["manage_service_plans"],
      "/service-planner/inserts": ["manage_service_plans"],
      "/conductor": ["use_ai"],
      "/availability": ["view_availability"],
      "/admin/requests": ["manage_users"],
      "/admin/invitations": ["manage_users"],
      "/admin/users": ["manage_users", "view_profiles", "manage_roles", "manage_profiles", "manage_sheet_music"],
      "/admin/roles": ["manage_roles"],
      "/admin/configuration": ["manage_profiles", "manage_sheet_music"],
      "/admin/ai": ["use_ai"],
      "/admin/ai/memory": ["use_ai"],
      "/admin/ai/philosophy": ["use_ai"],
    };
    const people = [SIGNED_OUT, member, musician, songLeader, director, administrator, person(["musician"], ["use_ai"]), person([], ["manage_roles"]), person(["music_director"], [], ["use_ai", "manage_service_plans"])];
    for (const who of people) {
      const pages = pagesOf(who);
      for (const [href, permissions] of Object.entries(needs)) {
        const may = who.signedIn && permissions.some((permission) => who.permissions.has(permission));
        expect(pages.includes(href), `${href} for ${[...who.permissions].join(",") || "nobody"}`).toBe(may);
      }
    }
  });

  it("treats someone not signed in as holding nothing, whatever the permissions say", () => {
    // As the navigation does while the session is still loading on a public page.
    const stale: NavContext = { signedIn: false, permissions: director.permissions };
    for (const href of RESTRICTED) expect(pagesOf(stale)).not.toContain(href);
    expect(commandsOf(stale)).toEqual(["toggle-theme"]);
    expect(offeredTo({ permission: "use_ai" }, stale)).toBe(false);
    expect(offeredTo({ only: "member" }, stale)).toBe(false);
    expect(offeredTo({ only: "visitor" }, stale)).toBe(true);
  });

  it("keeps the opening list short: Admin's sections, Inserts and the year recaps wait to be typed for", () => {
    const opening = searchSite(index, "", false, administrator).groups.find((group) => group.group === "pages")!.entries.map((entry) => entry.href);
    expect(opening).toEqual(["/dashboard", "/service-planner", "/conductor", "/song-list", "/library", "/availability", "/song-list/archive", "/song-list/year", "/profile", "/account", "/contact", "/admin"]);
  });

  it("finds the new pages by the words people would use for them", () => {
    expect(finds(director, "planner")).toContain("Service Planner");
    expect(finds(director, "plan songs")).toContain("Service Planner");
    expect(finds(director, "psalm")).toContain("Inserts");
    expect(finds(director, "inserts")[0]).toBe("Inserts");
    expect(finds(director, "assistant")).toContain("Conductor");
    expect(finds(musician, "out of town")).toEqual(expect.arrayContaining(["Availability", "Update my availability…"]));
    expect(finds(musician, "away")).toContain("Update my availability…");
    expect(finds(director, "past services")).toContain("Service plans archive");
    expect(finds(administrator, "requests")).toContain("Admin: Requests");
    expect(finds(administrator, "invite")).toContain("Admin: Invitations");
    expect(finds(administrator, "people")).toContain("Admin: People");
    expect(finds(administrator, "permissions")).toContain("Admin: Roles");
    expect(finds(administrator, "configuration")).toContain("Admin: Configuration");
    expect(finds(director, "ai usage")).toContain("Admin: AI Usage");
    expect(finds(director, "budget")).toContain("Admin: AI Usage");
    expect(finds(director, "memory")).toContain("Admin: AI Memory");
    expect(finds(director, "philosophy")).toContain("Admin: Planning Philosophy");
    expect(finds(director, "admin")[0]).toBe("Admin");
    // The same words find nothing for someone who may not open the page.
    for (const query of ["planner", "psalm insert", "assistant", "permissions", "budget", "philosophy"]) {
      expect(finds(member, query).filter((label) => /Planner|Inserts|Conductor|Admin/.test(label))).toEqual([]);
    }
  });
});

describe("Ask Conductor from the search", () => {
  const question = "When did we last sing Amazing Grace?";

  it("is offered to someone holding use_ai once something is typed, quoting what was typed", () => {
    const entry = askConductorEntry(`  ${question}  `, director);
    expect(entry).toMatchObject({ group: "conductor", action: "ask-conductor", label: `Ask Conductor: “${question}”` });
    expect(entry).not.toHaveProperty("href");
  });

  it("is never offered for empty input", () => {
    expect(askConductorEntry("", director)).toBeNull();
    expect(askConductorEntry("   ", director)).toBeNull();
    expect(commandsOf(director)).toContain("ask-conductor");
    expect(searchSite(index, "", false, director).groups.flatMap((group) => group.entries).some((entry) => entry.action === "ask-conductor")).toBe(false);
  });

  it("is never offered without use_ai, or to someone signed out", () => {
    for (const who of [SIGNED_OUT, member, musician, songLeader, person(["music_director"], [], ["use_ai"])]) {
      expect(askConductorEntry(question, who)).toBeNull();
      expect(finds(who, question).some((label) => label.startsWith("Ask Conductor"))).toBe(false);
    }
    expect(askConductorEntry(question, person(["musician"], ["use_ai"]))).not.toBeNull();
  });

  it("comes last, so Enter still opens the best match - and is first in line for a question that matches nothing", () => {
    const matching = searchSite(index, "amazing", false, director).groups;
    expect(matching.map((group) => group.group)).toEqual(["songs", "conductor"]);
    expect(matching[0].entries[0].label).toBe("Amazing Grace");
    const asked = searchSite(index, "why do we sing so many psalms in the evening?", false, director).groups;
    expect(asked.map((group) => group.group)).toEqual(["conductor"]);
  });
});

describe("the availability command", () => {
  it("is offered to someone holding view_availability, typed for or not, and to nobody else", () => {
    for (const who of [musician, songLeader, director, person([], ["view_availability"])]) {
      const opening = searchSite(index, "", false, who).groups.find((group) => group.group === "actions")!.entries;
      expect(opening[0]).toMatchObject({ action: "update-availability", label: "Update my availability…" });
      expect(opening[0]).not.toHaveProperty("href");
      expect(finds(who, "availability")).toContain("Update my availability…");
    }
    for (const who of [SIGNED_OUT, member, person(["musician"], [], ["view_availability"])]) {
      expect(commandsOf(who)).not.toContain("update-availability");
      expect(finds(who, "availability")).not.toContain("Update my availability…");
    }
  });

  it("goes by the participant's permission alone: managing others' adds nothing to the search", () => {
    // manage_availability without view_availability is not a participant, and gets no quick action.
    expect(commandsOf(person([], ["manage_availability"]))).not.toContain("update-availability");
  });
});
