import { describe, expect, it } from "vitest";

import type { IndexSong } from "@/lib/sheet-music";

import { accessImpact, fileImpact, upcomingWithheld } from "./sheet-access-report";

const ROLE_PERMISSIONS = new Map<string, string[]>([
  ["member", ["view_sheet_music"]],
  ["song_leader", ["lead_songs"]],
  ["custom_reader", ["view_sheet_music"]],
]);

const person = (id: string) => ({ id, name: `Name ${id}` });

describe("accessImpact", () => {
  const impact = (over: Partial<Parameters<typeof accessImpact>[0]> = {}) =>
    accessImpact({
      accounts: [person("u1")],
      userRoles: new Map(),
      rolePermissions: ROLE_PERMISSIONS,
      overrides: new Map(),
      affiliations: new Map(),
      ...over,
    });

  it("reports a basic member losing access", () => {
    expect(impact()).toMatchObject({ total: 1, keep: 0, lose: [{ id: "u1", name: "Name u1" }] });
  });

  it("keeps a verified member", () => {
    expect(impact({ affiliations: new Map([["u1", "verified"]]) })).toMatchObject({ keep: 1, lose: [] });
  });

  it("does not count a revoked affiliation", () => {
    expect(impact({ affiliations: new Map([["u1", "revoked"]]) }).lose).toHaveLength(1);
  });

  it.each(["musician", "custom_reader", "administrator", "song_leader"])("keeps someone holding %s", (role) => {
    expect(impact({ userRoles: new Map([["u1", [role]]]) })).toMatchObject({ keep: 1, lose: [] });
  });

  it("keeps an individual grant", () => {
    expect(impact({ overrides: new Map([["u1", [{ permission: "view_sheet_music", effect: "grant" }]]]) }).keep).toBe(1);
  });

  it("does not list someone already denied as losing access", () => {
    const result = impact({ overrides: new Map([["u1", [{ permission: "view_sheet_music", effect: "deny" }]]]) });
    expect(result).toMatchObject({ keep: 0, lose: [], unchangedWithout: 1 });
  });
});

const song = (id: string, title: string, files: Array<{ slug: string; eligibility?: "public" | "restricted" | "withheld" }>) =>
  ({
    id,
    title,
    rights: "cleared",
    versions: [{ typeId: 1, label: "Standard", version: "1", keys: null, capoFret: null, files: files.map((file) => ({ format: "pdf", driveFileId: `d-${file.slug}`, ...file })) }],
  }) as unknown as IndexSong;

describe("fileImpact", () => {
  it("counts each class and lists withheld files without Drive IDs", () => {
    const result = fileImpact([song("A-1", "A", [{ slug: "a.pdf", eligibility: "public" }, { slug: "b.pdf", eligibility: "restricted" }, { slug: "c.pdf", eligibility: "withheld" }])]);
    expect(result).toMatchObject({ public: 1, restricted: 1, withheld: 1 });
    expect(result.withheldFiles).toEqual([{ songId: "A-1", title: "A", label: "Standard", format: "pdf", file: "c.pdf" }]);
    expect(JSON.stringify(result)).not.toContain("d-c.pdf");
  });

  it("counts an unclassified file as withheld", () => {
    expect(fileImpact([song("A-1", "A", [{ slug: "a.pdf" }])]).withheld).toBe(1);
  });
});

describe("upcomingWithheld", () => {
  const find = (ref: { title: string }) => (ref.title === "Blocked" ? song("A-1", "Blocked", [{ slug: "a.pdf", eligibility: "withheld" }]) : ref.title === "Fine" ? song("B-2", "Fine", [{ slug: "b.pdf", eligibility: "restricted" }]) : null);
  const service = (date: string | null, titles: string[]) => ({ date, dateLabel: `Label ${date}`, songs: titles.map((title) => ({ title })) });

  it("lists upcoming songs whose every file is withheld", () => {
    expect(upcomingWithheld([service("2026-12-06", ["Blocked", "Fine", "Unknown"])], find, "2026-12-01")).toEqual([{ date: "2026-12-06", dateLabel: "Label 2026-12-06", title: "Blocked" }]);
  });

  it("ignores past and undated services", () => {
    expect(upcomingWithheld([service("2026-11-01", ["Blocked"]), service(null, ["Blocked"])], find, "2026-12-01")).toEqual([]);
  });
});
