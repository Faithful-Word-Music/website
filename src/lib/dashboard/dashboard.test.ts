import { describe, expect, it } from "vitest";

import { DEFAULT_ROLES, resolvePermissions } from "@/lib/auth/permissions";
import { collectAttention, type AttentionItem } from "@/lib/dashboard/attention";
import { buildComingUp, selectComingUp } from "@/lib/dashboard/coming-up";
import { buildFocus, servesInMusic, type DashboardFocus } from "@/lib/dashboard/focus";
import {
  accountRequestAttention,
  availabilityAttention,
  profileAttention,
  sheetTypeAttention,
} from "@/lib/dashboard/providers";
import type { IndexSong, SheetFile, SheetMusicIndex, SongVersion } from "@/lib/sheet-music";
import {
  assignedFiles,
  DEFAULT_SHEET_MUSIC_TYPES,
  describeSource,
  fileOfType,
  legacyVariant,
  songCount,
} from "@/lib/sheet-music-type";
import type { Service } from "@/types/song-list";

const rolePermissions = new Map(DEFAULT_ROLES.map((role) => [role.key, role.permissions as string[]]));
const permissionsOf = (roleKeys: string[]) => resolvePermissions(roleKeys, rolePermissions);

function focusFor(
  roleKeys: string[],
  extra: { titles?: string[]; instruments?: string[]; permissions?: Set<never> } = {},
): DashboardFocus {
  return buildFocus({
    roleKeys,
    permissions: permissionsOf(roleKeys),
    titles: (extra.titles ?? []).map((label, index) => ({ label, isPrimary: index === 0 })),
    instruments: (extra.instruments ?? []).map((label, index) => ({ label, isPrimary: index === 0 })),
  });
}

describe("buildFocus", () => {
  it("sees a plain member as neither playing nor leading, with no admin capabilities", () => {
    const focus = focusFor([]);
    expect(servesInMusic(focus)).toBe(false);
    expect(focus.administers).toBe(false);
    expect(focus.opensMemberSheetMusic).toBe(true);
  });

  it("treats the Musician role as playing", () => {
    expect(focusFor(["musician"]).plays).toBe(true);
  });

  it("treats the Song Leader role, or the title alone, as leading singing", () => {
    expect(focusFor(["song_leader"]).leadsSinging).toBe(true);
    expect(focusFor([], { titles: ["Song Leader"] }).leadsSinging).toBe(true);
  });

  it("treats listing an instrument as playing, but grants nothing for it", () => {
    const focus = focusFor([], { instruments: ["Piano"] });
    expect(focus.plays).toBe(true);
    expect(focus.administers).toBe(false);
    expect(focus.managesSheetMusic).toBe(false);
  });

  it("combines several responsibilities into one focus", () => {
    const focus = focusFor(["administrator", "music_director"], { titles: ["Music Director", "Pianist"] });
    expect(focus.administers).toBe(true);
    expect(focus.reviewsAccounts).toBe(true);
    expect(focus.managesSheetMusic).toBe(true);
    expect(focus.titles).toEqual(["Music Director", "Pianist"]);
  });

  it("lets a Music Director without admin roles look after sheet music and see People", () => {
    const focus = focusFor(["music_director"]);
    expect(focus.managesSheetMusic).toBe(true);
    expect(focus.seesPeople).toBe(true);
    expect(focus.reviewsAccounts).toBe(false);
  });

  it("gives the music ministry's participants Availability, and only the Music Director manages it", () => {
    for (const role of ["musician", "song_leader", "music_director"]) {
      expect(focusFor([role]).tracksAvailability).toBe(true);
    }
    expect(focusFor(["musician"]).managesAvailability).toBe(false);
    expect(focusFor(["song_leader"]).managesAvailability).toBe(false);
    expect(focusFor(["music_director"]).managesAvailability).toBe(true);
  });

  it("leaves Availability out for a Member-only account, and it does not follow from an instrument or title", () => {
    expect(focusFor([]).tracksAvailability).toBe(false);
    expect(focusFor([], { instruments: ["Piano"], titles: ["Song Leader"] }).tracksAvailability).toBe(false);
  });

  it("follows permissions, not role names: a custom role with manage_users reviews accounts", () => {
    const focus = buildFocus({ roleKeys: ["helper"], permissions: new Set(["manage_users"]), titles: [], instruments: [] });
    expect(focus.reviewsAccounts).toBe(true);
    expect(focus.administers).toBe(true);
  });
});

describe("collectAttention", () => {
  const item = (id: string, priority: AttentionItem["priority"]): AttentionItem => ({
    id,
    priority,
    title: id,
    href: "/",
    action: "Go",
  });

  it("puts the most pressing first and keeps the providers' order otherwise", () => {
    const ids = collectAttention([item("a", "low"), item("b", "normal")], [item("c", "urgent"), item("d", "normal")]).map(
      (entry) => entry.id,
    );
    expect(ids).toEqual(["c", "b", "d", "a"]);
  });

  it("shows something raised by two responsibilities once, at its most pressing", () => {
    const result = collectAttention([item("x", "low")], [item("x", "urgent")]);
    expect(result).toHaveLength(1);
    expect(result[0].priority).toBe("urgent");
  });

  it("is empty when nothing needs doing", () => {
    expect(collectAttention([], [])).toEqual([]);
  });
});

describe("attention providers", () => {
  it("asks for nothing when the profile is complete", () => {
    expect(profileAttention([])).toEqual([]);
  });

  it("lists what the profile lacks", () => {
    const [entry] = profileAttention(["A profile photo", "Your music theory level"]);
    expect(entry.href).toBe("/profile/edit");
    expect(entry.detail).toBe("Still missing: a profile photo and your music theory level.");
  });

  it("raises waiting requests only for reviewers, and never as a zero", () => {
    expect(accountRequestAttention(focusFor(["administrator"]), 0)).toEqual([]);
    expect(accountRequestAttention(focusFor(["musician"]), 3)).toEqual([]);
    const [entry] = accountRequestAttention(focusFor(["administrator"]), 2);
    expect(entry.title).toBe("2 account requests are waiting");
  });
});

/* ---------------------------------------------------------------------- */

const STANDARD = 1;
const CHORDS = 2;
const CAPO = 3;
const CLARINET = 4;
const TYPE_LABELS: Record<number, string> = {
  [STANDARD]: "Standard",
  [CHORDS]: "Standard (Chords)",
  [CAPO]: "Capo (Chords)",
  [CLARINET]: "Clarinet (Bb)",
};

function file(slug: string, format: SheetFile["format"] = "pdf"): SheetFile {
  return { format, slug, driveFileId: `drive-${slug}` };
}

function version(typeId: number, files: SheetFile[]): SongVersion {
  return { typeId, label: TYPE_LABELS[typeId], version: "1", keys: null, capoFret: null, files };
}

function song(versions: SongVersion[], rights: IndexSong["rights"] = "copyrighted"): IndexSong {
  return {
    id: "SSSH1989-233",
    title: "Like a River Glorious",
    composer: null,
    lyricist: null,
    keys: null,
    type: null,
    collection: "Soul-Stirring Songs and Hymns 1989",
    hymnNumber: "233",
    category: null,
    occasion: null,
    source: null,
    rights,
    versions,
  };
}

const fullSong = song([
  version(STANDARD, [file("standard-1.pdf"), file("standard-1.mscz", "musescore")]),
  version(CHORDS, [file("standard-chords-1.pdf")]),
  version(CAPO, [file("capo-chords-1.pdf")]),
  version(CLARINET, [file("clarinet-bb-1.pdf")]),
]);
const anyFile = () => true;
const TYPES = Object.entries(TYPE_LABELS).map(([id, label]) => ({ id: Number(id), label }));

describe("default sheet music types", () => {
  it("start as Standard, Standard (Chords) and Capo (Chords), each mapping the assignments made before types", () => {
    expect(DEFAULT_SHEET_MUSIC_TYPES.map((type) => [type.label, legacyVariant(type.legacyKey)])).toEqual([
      ["Standard", "Standard"],
      ["Standard (Chords)", "Chords"],
      ["Capo (Chords)", "Capo"],
    ]);
  });

  it("describe their sources in words", () => {
    expect(DEFAULT_SHEET_MUSIC_TYPES[0].sources.map(describeSource)).toEqual([
      'Every "Standard" folder inside 01 - Congregational',
      "03 - Ensemble & Classical",
    ]);
    expect(DEFAULT_SHEET_MUSIC_TYPES[2].sources.map(describeSource)).toEqual([
      'Every "Chords › Capo" folder inside 01 - Congregational',
    ]);
  });
});

describe("fileOfType", () => {
  it("finds the PDF of exactly the assigned type", () => {
    expect(fileOfType(fullSong, CLARINET, anyFile)?.file.slug).toBe("clarinet-bb-1.pdf");
    expect(fileOfType(fullSong, CAPO, anyFile)?.file.slug).toBe("capo-chords-1.pdf");
    expect(fileOfType(fullSong, STANDARD, anyFile)?.file.slug).toBe("standard-1.pdf");
  });

  it("never offers another type when the song lacks the assigned one", () => {
    const standardOnly = song([version(STANDARD, [file("standard-1.pdf")])]);
    expect(fileOfType(standardOnly, CAPO, anyFile)).toBeNull();
  });

  it("never offers a MuseScore file, even of the right type", () => {
    const museScoreOnly = song([version(STANDARD, [file("standard-1.mscz", "musescore")])]);
    expect(fileOfType(museScoreOnly, STANDARD, anyFile)).toBeNull();
  });

  it("only offers a file the person may open", () => {
    expect(fileOfType(fullSong, STANDARD, () => false)).toBeNull();
  });

  it("prefers version 1 when there are several of the type", () => {
    const two = song([
      { ...version(STANDARD, [file("standard-2.pdf")]), version: "2" },
      version(STANDARD, [file("standard-1.pdf")]),
    ]);
    expect(fileOfType(two, STANDARD, anyFile)?.file.slug).toBe("standard-1.pdf");
  });

  it("counts the songs that have a type", () => {
    const standardOnly = song([version(STANDARD, [file("standard-1.pdf")])]);
    expect(songCount([fullSong, standardOnly], CLARINET)).toBe(1);
    expect(songCount([fullSong, standardOnly], STANDARD)).toBe(2);
  });
});

describe("assignedFiles", () => {
  const slugs = (found: ReturnType<typeof assignedFiles>) => found.map(({ file }) => file.slug);

  it("shows the first choice, with the person's other types the song has as alternatives", () => {
    expect(slugs(assignedFiles(fullSong, [CAPO, CHORDS], anyFile))).toEqual(["capo-chords-1.pdf", "standard-chords-1.pdf"]);
  });

  it("falls back to the next choice when the song lacks the first", () => {
    const chordsOnly = song([version(CHORDS, [file("standard-chords-1.pdf")])]);
    expect(slugs(assignedFiles(chordsOnly, [CAPO, CHORDS], anyFile))).toEqual(["standard-chords-1.pdf"]);
  });

  it("never offers a type outside the list", () => {
    const standardOnly = song([version(STANDARD, [file("standard-1.pdf")])]);
    expect(assignedFiles(standardOnly, [CAPO, CHORDS], anyFile)).toEqual([]);
  });

  it("passes over a type with only a MuseScore file", () => {
    const museScoreCapo = song([
      version(CAPO, [file("capo-chords-1.mscz", "musescore")]),
      version(CHORDS, [file("standard-chords-1.pdf")]),
    ]);
    expect(slugs(assignedFiles(museScoreCapo, [CAPO, CHORDS], anyFile))).toEqual(["standard-chords-1.pdf"]);
  });

  it("passes over a file the person may not open", () => {
    const noCapo = (sheet: SheetFile) => !sheet.slug.startsWith("capo");
    expect(slugs(assignedFiles(fullSong, [CAPO, CHORDS], noCapo))).toEqual(["standard-chords-1.pdf"]);
  });

  it("works the same with one type", () => {
    expect(slugs(assignedFiles(fullSong, [STANDARD], anyFile))).toEqual(["standard-1.pdf"]);
  });
});

describe("sheetTypeAttention", () => {
  it("tells whoever looks after sheet music which musicians have no type yet", () => {
    const missing = [{ id: "u1", name: "Amy" }];
    expect(sheetTypeAttention(focusFor(["musician"]), missing)).toEqual([]);
    const [entry] = sheetTypeAttention(focusFor(["music_director"]), missing);
    expect(entry.title).toBe("1 musician has no sheet music chosen");
    expect(entry.href).toBe("/admin/users/u1");
    expect(sheetTypeAttention(focusFor(["music_director"]), [])).toEqual([]);
  });
});

/* ---------------------------------------------------------------------- */

function service(id: string, startsAt: string, songs: Service["songs"] = []): Service {
  return {
    id,
    dateLabel: "Sunday, October 4, 2026",
    serviceLabel: "Morning Service",
    slot: "AM",
    date: startsAt.slice(0, 10),
    startsAt,
    songs,
    pendingSongs: 0,
  };
}

const NOW = Date.parse("2026-10-01T12:00:00-07:00");

describe("selectComingUp", () => {
  it("lists the next services within the week, at most three, past ones left out", () => {
    const services = [
      service("past", "2026-09-30T19:00:00-07:00"),
      service("a", "2026-10-04T10:30:00-07:00"),
      service("b", "2026-10-04T18:00:00-07:00"),
      service("c", "2026-10-07T19:00:00-07:00"),
      service("d", "2026-10-08T10:30:00-07:00"),
    ];
    expect(selectComingUp(services, NOW).map((entry) => [entry.service.id, entry.status])).toEqual([
      ["a", "next"],
      ["b", "upcoming"],
      ["c", "upcoming"],
    ]);
  });

  it("always shows the next service, however far off", () => {
    const services = [service("far", "2026-11-01T10:30:00-07:00"), service("farther", "2026-11-02T10:30:00-07:00")];
    expect(selectComingUp(services, NOW).map((entry) => entry.service.id)).toEqual(["far"]);
  });
});

describe("buildComingUp", () => {
  const index: SheetMusicIndex = { songs: [fullSong], types: TYPES };
  const services = [service("a", "2026-10-04T10:30:00-07:00", [{ number: "233", title: "Like a River Glorious", key: "Ab" }])];

  it("offers every type a service can be printed in only to someone who prints for others", () => {
    const partial: SheetMusicIndex = {
      songs: [song([version(STANDARD, [file("standard-1.pdf")]), version(CAPO, [file("capo-chords-1.mscz", "musescore")])])],
      types: TYPES,
    };
    const [own] = buildComingUp(services, NOW, focusFor(["musician"]), { index: partial, sheetTypes: [STANDARD] });
    expect(own.packetTypes).toEqual([]);

    const [director] = buildComingUp(services, NOW, focusFor(["music_director"]), {
      index: partial,
      sheetTypes: [],
      anyType: true,
    });
    // Standard has a PDF. Capo has only a MuseScore file, and the others nothing: not offered.
    expect(director.packetTypes).toEqual([
      { typeId: STANDARD, label: "Standard", href: "/dashboard/sheet-music/2026-10-04-am?type=1", songs: 1 },
    ]);
    // Their own button is unchanged: no types of their own, so none.
    expect(director.packetHref).toBeNull();
  });

  it("puts a song in the service PDF when it has the assigned type", () => {
    const [first] = buildComingUp(services, NOW, focusFor(["musician"]), { index, sheetTypes: [CAPO] });
    expect(first.packetSongs.map((song) => song.title)).toEqual(["Like a River Glorious"]);
  });

  it("offers no service PDF to someone with no assigned type - whatever their instruments", () => {
    const pianist = focusFor(["musician"], { instruments: ["Piano"] });
    const [first] = buildComingUp(services, NOW, pianist, { index, sheetTypes: [] });
    expect(first.packetHref).toBeNull();
  });

  it("leaves a song out when it lacks the assigned type, rather than using another type", () => {
    const [first] = buildComingUp(services, NOW, focusFor(["musician"]), {
      index,
      sheetTypes: [99],
    });
    expect(first.packetSongs).toEqual([]);
  });

  it("includes a copyrighted song's music only with the members' sheet-music permission", () => {
    const withoutPermission = buildFocus({ roleKeys: ["musician"], permissions: new Set(), titles: [], instruments: [] });
    const [first] = buildComingUp(services, NOW, withoutPermission, { index, sheetTypes: [STANDARD] });
    expect(first.packetSongs).toEqual([]);
  });

  it("links the whole service's PDF by date and time of day, counting the songs in it", () => {
    const withTwo = [
      service("a", "2026-10-04T10:30:00-07:00", [
        { number: "233", title: "Like a River Glorious", key: "Ab" },
        { number: null, title: "A Song Not In The Index", key: "C" },
      ]),
    ];
    const [first] = buildComingUp(withTwo, NOW, focusFor(["musician"]), { index, sheetTypes: [CAPO] });
    expect(first.packetHref).toBe("/dashboard/sheet-music/2026-10-04-am");
    expect(first.packetSongs.map((song) => song.title)).toEqual(["Like a River Glorious"]);
  });

  describe("with types in order of preference", () => {
    const chordsOnly: IndexSong = {
      ...song([version(CHORDS, [file("standard-chords-1.pdf")])]),
      id: "SSSH1989-100",
      title: "Standing on the Promises",
      hymnNumber: "100",
    };
    const mixed = [
      service("a", "2026-10-04T10:30:00-07:00", [
        { number: "233", title: "Like a River Glorious", key: "Ab" },
        { number: "100", title: "Standing on the Promises", key: "Bb" },
        { number: null, title: "A Song Not In The Index", key: "C" },
      ]),
    ];
    const [first] = buildComingUp(mixed, NOW, focusFor(["musician"]), {
      index: { songs: [fullSong, chordsOnly], types: TYPES },
      sheetTypes: [CAPO, CHORDS],
    });

    it("uses each song's first available type, names it, and links the others", () => {
      expect(first.showLabels).toBe(true);
      expect(first.slots[0]?.sheet).toEqual({
        status: "found",
        shown: { label: "Capo (Chords)", href: "/library/songs/like-a-river-glorious/sheet-music/capo-chords-1.pdf" },
        alternatives: [
          {
            label: "Standard (Chords)",
            href: "/library/songs/like-a-river-glorious/sheet-music/standard-chords-1.pdf",
          },
        ],
      });
      expect(first.slots[1]?.sheet).toMatchObject({ status: "found", shown: { label: "Standard (Chords)" }, alternatives: [] });
    });

    it("says when a song has none of their types", () => {
      expect(first.slots[2]?.sheet).toEqual({ status: "missing" });
    });

    it("puts the fallback song in the service PDF, with the type each uses", () => {
      expect(first.packetSongs).toEqual([
        { number: "233", title: "Like a River Glorious", label: "Capo (Chords)" },
        { number: "100", title: "Standing on the Promises", label: "Standard (Chords)" },
      ]);
    });
  });

  it("does not name the type for someone with only one", () => {
    const [first] = buildComingUp(services, NOW, focusFor(["musician"]), { index, sheetTypes: [CAPO] });
    expect(first.showLabels).toBe(false);
    expect(first.slots[0]?.sheet).toMatchObject({ status: "found", shown: { label: "Capo (Chords)" } });
  });

});

describe("availabilityAttention", () => {
  it("asks a participant with no normal services to set them, at low priority", () => {
    const [item] = availabilityAttention(focusFor(["musician"]), []);
    expect(item).toMatchObject({ id: "availability:normal", priority: "low", href: "/availability#normal" });
  });

  it("says nothing once normal services are set, to someone not on the board, or to a Member", () => {
    expect(availabilityAttention(focusFor(["musician"]), ["sunday_am"])).toEqual([]);
    expect(availabilityAttention(focusFor(["administrator"]), null)).toEqual([]);
    expect(availabilityAttention(focusFor([]), [])).toEqual([]);
  });
});
