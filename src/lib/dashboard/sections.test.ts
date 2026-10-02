import { describe, expect, it } from "vitest";

import { DEFAULT_ROLES, resolvePermissions } from "@/lib/auth/permissions";
import { buildFocus, type DashboardFocus } from "@/lib/dashboard/focus";
import { newSheetMusic } from "@/lib/dashboard/new-sheet-music";
import { groupPeople, invitationFollowUps, musiciansWithoutInstruments } from "@/lib/dashboard/people";
import { instrumentAttention, invitationAttention, sheetGapAttention } from "@/lib/dashboard/providers";
import { brushUpSongs, quarterGlance } from "@/lib/dashboard/repertoire";
import { findSheetGaps, gapsFor } from "@/lib/dashboard/sheet-gaps";
import type { IndexSong, SheetFile, SheetMusicIndex, SongVersion } from "@/lib/sheet-music";
import type { DatedService } from "@/types/song-list";

const NOW = Date.parse("2026-10-01T12:00:00-07:00");
const DAY = 86_400_000;
const HYMNAL = "Soul-Stirring Songs and Hymns 1989";

const rolePermissions = new Map(DEFAULT_ROLES.map((role) => [role.key, role.permissions as string[]]));
function focusFor(roleKeys: string[]): DashboardFocus {
  return buildFocus({ roleKeys, permissions: resolvePermissions(roleKeys, rolePermissions), titles: [], instruments: [] });
}

const TYPES = [
  { id: 1, label: "Standard" },
  { id: 2, label: "Standard (Chords)" },
  { id: 3, label: "Capo (Chords)" },
];
const [STANDARD, CHORDS, CAPO] = TYPES;

function file(slug: string, format: SheetFile["format"] = "pdf"): SheetFile {
  return { format, slug, driveFileId: `drive-${slug}` };
}

function version(type: { id: number; label: string }, files: SheetFile[]): SongVersion {
  return { typeId: type.id, label: type.label, version: "1", keys: null, capoFret: null, files };
}

function song(versions: SongVersion[], rights: IndexSong["rights"] = "cleared"): IndexSong {
  return {
    id: "SSSH1989-233",
    title: "Like a River Glorious",
    composer: null,
    lyricist: null,
    keys: null,
    type: null,
    collection: HYMNAL,
    hymnNumber: "233",
    category: null,
    occasion: null,
    source: null,
    rights,
    versions,
  };
}

function dated(startsAt: string, titles: Array<[string, string | null]>): DatedService {
  return {
    date: startsAt.slice(0, 10),
    slot: "AM",
    startsAt,
    songs: titles.map(([title, number]) => ({ title, number, key: null })),
  };
}

describe("sheet-music gaps", () => {
  it("finds nothing wrong when every type has a PDF and the rights are settled", () => {
    const complete = song([
      version(STANDARD, [file("standard-1.pdf")]),
      version(CAPO, [file("capo-chords-1.pdf")]),
    ]);
    expect(gapsFor(complete, STANDARD)).toEqual([]);
  });

  it("flags sheet music with MuseScore but no PDF, even when other PDFs exist", () => {
    const partial = song([
      version(STANDARD, [file("standard-1.mscz", "musescore")]),
      version(CHORDS, [file("standard-chords-1.mscz", "musescore")]),
      version(CAPO, [file("capo-chords-1.pdf")]),
    ]);
    expect(gapsFor(partial, STANDARD)).toEqual([{ kind: "missing-pdf", types: ["Standard", "Standard (Chords)"] }]);
  });

  it("flags a missing Index entry, missing files, a missing first type and unsettled rights", () => {
    expect(gapsFor(null, STANDARD)).toEqual([{ kind: "no-entry" }]);
    expect(gapsFor(song([]), STANDARD)).toEqual([{ kind: "no-files" }]);
    expect(gapsFor(song([version(CAPO, [file("capo-chords-1.pdf")])]), STANDARD)).toEqual([
      { kind: "no-main-type", type: "Standard" },
    ]);
    expect(gapsFor(song([version(STANDARD, [file("standard-1.pdf")])], "needs-review"), STANDARD)).toEqual([
      { kind: "rights" },
    ]);
  });

  it("looks only at the next three services, however far ahead the month is planned", () => {
    const index: SheetMusicIndex = { songs: [], types: TYPES };
    const services = ["10-04", "10-05", "10-07", "10-11", "10-14"].map((day, position) =>
      dated(`2026-${day}T10:30:00-07:00`, [[`Song ${position + 1}`, null]]),
    );
    expect(findSheetGaps(services.reverse(), index, HYMNAL).map((entry) => entry.title)).toEqual([
      "Song 1",
      "Song 2",
      "Song 3",
    ]);
  });

  it("lists each upcoming song once, from the first service it is in", () => {
    const index: SheetMusicIndex = { songs: [song([version(STANDARD, [file("standard-1.pdf")])])], types: TYPES };
    const gaps = findSheetGaps(
      [
        dated("2026-10-11T10:30:00-07:00", [
          ["Unknown Hymn", null],
          ["Like a River Glorious", "233"],
        ]),
        dated("2026-10-04T10:30:00-07:00", [["Unknown Hymn", null]]),
      ],
      index,
      HYMNAL,
    );
    expect(gaps.map((entry) => [entry.title, entry.firstStartsAt])).toEqual([
      ["Unknown Hymn", "2026-10-04T10:30:00-07:00"],
    ]);
  });
});

describe("brushUpSongs", () => {
  it("lists songs in the next two weeks not sung for six months or never recorded, never-recorded first", () => {
    const past = [
      dated("2025-12-07T10:30:00-07:00", [["Old Favourite", "10"]]),
      dated("2026-09-20T10:30:00-07:00", [["Recent", "20"]]),
    ];
    const upcoming = [
      dated("2026-10-04T10:30:00-07:00", [
        ["Recent", "20"],
        ["Old Favourite", "10"],
        ["Brand New", null],
      ]),
      dated("2026-11-01T10:30:00-07:00", [["Far Off", "30"]]),
    ];
    expect(brushUpSongs(past, upcoming, NOW).map((entry) => [entry.title, entry.lastSung])).toEqual([
      ["Brand New", null],
      ["Old Favourite", "2025-12-07T10:30:00-07:00"],
    ]);
  });
});

describe("quarterGlance", () => {
  const past = [
    dated("2026-07-05T10:30:00-07:00", [
      ["A", "1"],
      ["B", "2"],
    ]),
    dated("2026-08-02T10:30:00-07:00", [
      ["A", "1"],
      ["C", "3"],
    ]),
  ];

  it("shows the quarter just ended, not zeros, before the new quarter's first service", () => {
    const glance = quarterGlance(past, NOW);
    expect(glance).toMatchObject({ label: "Jul–Sep 2026", current: false, services: 2, differentSongs: 3 });
    expect(glance?.mostSung).toEqual({ title: "A", slug: "a", count: 2 });
  });

  it("shows the quarter in progress once it has a service", () => {
    const later = Date.parse("2026-10-05T12:00:00-07:00");
    const glance = quarterGlance([...past, dated("2026-10-04T10:30:00-07:00", [["D", "4"]])], later);
    expect(glance).toMatchObject({ current: true, services: 1, differentSongs: 1, mostSung: null });
  });

  it("is null with no records", () => {
    expect(quarterGlance([], NOW)).toBeNull();
  });
});

describe("newSheetMusic", () => {
  const recent = { ...file("standard-1.pdf"), modifiedTime: "2026-09-28T12:00:00Z" };
  const old = { ...file("standard-1.pdf"), modifiedTime: "2026-06-01T12:00:00Z" };
  const indexWith = (target: SheetFile): SheetMusicIndex => ({ songs: [song([version(STANDARD, [target])])], types: TYPES });
  const songs = [{ title: "Like a River Glorious", number: "233" }];

  it("lists songs whose files changed in the last two weeks", () => {
    expect(newSheetMusic(songs, new Set(["like a river glorious"]), indexWith(recent), HYMNAL, () => true, NOW)).toEqual([
      { title: "Like a River Glorious", slug: "like-a-river-glorious", changedAt: "2026-09-28T12:00:00Z", upcoming: true },
    ]);
  });

  it("leaves out older changes, and files the person may not open", () => {
    expect(newSheetMusic(songs, new Set(), indexWith(old), HYMNAL, () => true, NOW)).toEqual([]);
    expect(newSheetMusic(songs, new Set(), indexWith(recent), HYMNAL, () => false, NOW)).toEqual([]);
  });
});

describe("people", () => {
  const people = [
    { id: "u1", name: "Zed", title: "Pianist", roleKeys: ["musician"], sheetMusic: "Standard" },
    { id: "u2", name: "Amy", title: null, roleKeys: ["musician", "song_leader"], sheetMusic: null },
    { id: "u3", name: "Bob", title: null, roleKeys: [], sheetMusic: null },
    { id: "u4", name: "Cal", title: null, roleKeys: ["administrator"], sheetMusic: null },
    { id: "u5", name: "Dee", title: null, roleKeys: ["member"], sheetMusic: null },
  ];

  it("groups musicians, song leaders and people with no role beyond Member, by name", () => {
    const groups = groupPeople(people);
    expect(groups.musicians.map((person) => person.name)).toEqual(["Amy", "Zed"]);
    expect(groups.songLeaders.map((person) => person.name)).toEqual(["Amy"]);
    expect(groups.membersOnly.map((person) => person.name)).toEqual(["Bob", "Dee"]);
  });

  it("finds musicians who list no instrument, and tells only those who see profiles", () => {
    const missing = musiciansWithoutInstruments(groupPeople(people).musicians, new Map([["u1", 2]]));
    expect(missing.map((person) => person.id)).toEqual(["u2"]);
    expect(instrumentAttention(focusFor(["musician"]), missing)).toEqual([]);
    expect(instrumentAttention(focusFor(["administrator"]), missing)[0].href).toBe("/admin/users/u2");
  });
});

describe("invitation follow-ups", () => {
  it("finds week-old unanswered invitations, and recently expired ones not sent again", () => {
    const followUps = invitationFollowUps(
      [
        { email: "new@x.org", createdAt: NOW - 2 * DAY },
        { email: "slow@x.org", createdAt: NOW - 10 * DAY },
        { email: "again@x.org", createdAt: NOW - 1 * DAY },
      ],
      [
        { email: "lapsed@x.org", createdAt: NOW - 40 * DAY },
        { email: "again@x.org", createdAt: NOW - 40 * DAY },
        { email: "ancient@x.org", createdAt: NOW - 200 * DAY },
      ],
      30,
      NOW,
    );
    expect(followUps.unanswered.map((entry) => entry.email)).toEqual(["slow@x.org"]);
    expect(followUps.expired.map((entry) => entry.email)).toEqual(["lapsed@x.org"]);
    expect(invitationAttention(focusFor(["administrator"]), followUps)[0].detail).toBe(
      "1 not accepted after a week · 1 expired unused",
    );
    expect(invitationAttention(focusFor(["musician"]), followUps)).toEqual([]);
  });
});

describe("sheetGapAttention", () => {
  it("is raised only for people who look after sheet music, and only when there are gaps", () => {
    expect(sheetGapAttention(focusFor(["musician"]), [{}])).toEqual([]);
    expect(sheetGapAttention(focusFor(["music_director"]), [])).toEqual([]);
    expect(sheetGapAttention(focusFor(["music_director"]), [{}, {}])[0].title).toBe(
      "2 songs in the next three services need sheet music work",
    );
  });
});
