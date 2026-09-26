import { describe, expect, it } from "vitest";

import missions from "@/lib/__fixtures__/missions-conference-2025.json";
import september from "@/lib/__fixtures__/september-2026.json";
import {
  buildCalendar,
  calendarPath,
  escapeText,
  foldLine,
  parseKinds,
  serviceKind,
  SERVICE_KINDS,
} from "@/lib/calendar";
import { parseMonthGrid } from "@/lib/song-list";

const month = parseMonthGrid("September", september as string[][]);
const conference = parseMonthGrid("Missions Conference", missions as string[][]);
const now = Date.parse("2026-09-25T12:00:00-07:00");
const all = new Set(SERVICE_KINDS);

/** The unfolded content lines of a feed. */
const unfold = (feed: string) => feed.replace(/\r\n /g, "").split("\r\n");
const events = (feed: string) => unfold(feed).filter((line) => line === "BEGIN:VEVENT").length;

describe("serviceKind", () => {
  it("tells the regular services apart from special meetings", () => {
    expect(serviceKind({ date: "2026-09-27", slot: "AM" })).toBe("sun-am");
    expect(serviceKind({ date: "2026-09-27", slot: "PM" })).toBe("sun-pm");
    expect(serviceKind({ date: "2026-09-02", slot: "PM" })).toBe("wed-pm");
    expect(serviceKind({ date: "2025-11-06", slot: "PM" })).toBe("special");
    expect(serviceKind({ date: "2026-09-02", slot: "AM" })).toBe("special");
    expect(serviceKind({ date: null, slot: "AM" })).toBeNull();
  });
});

describe("parseKinds and calendarPath", () => {
  it("reads the chosen kinds, ignoring anything unknown", () => {
    expect([...parseKinds("sun-am, WED-PM,bogus")]).toEqual(["sun-am", "wed-pm"]);
  });

  it("falls back to every kind rather than an empty calendar", () => {
    expect(parseKinds(null).size).toBe(4);
    expect(parseKinds("nonsense").size).toBe(4);
  });

  it("keeps a fixed order, and a bare address for everything", () => {
    expect(calendarPath(["wed-pm", "sun-am"])).toBe("/song-list/calendar.ics?services=sun-am,wed-pm");
    expect(calendarPath(SERVICE_KINDS)).toBe("/song-list/calendar.ics");
  });
});

describe("escapeText and foldLine", () => {
  it("escapes the characters iCalendar reserves", () => {
    expect(escapeText("Holy, Holy; Holy\\\nAmen")).toBe("Holy\\, Holy\\; Holy\\\\\\nAmen");
  });

  it("keeps every physical line within 75 octets without splitting a character", () => {
    const line = `DESCRIPTION:${"#114  The Great Physician – Eb\\n".repeat(8)}`;
    const folded = foldLine(line);
    const bytes = new TextEncoder();
    for (const part of folded.split("\r\n")) expect(bytes.encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });
});

describe("buildCalendar", () => {
  const feed = buildCalendar([month], all, now);
  const lines = unfold(feed);

  it("is a well-formed calendar with CRLF line endings", () => {
    expect(feed.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(feed.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(feed.replace(/\r\n/g, "")).not.toContain("\n");
  });

  /** One event's lines, found by its id. */
  const eventLines = (uid: string) => {
    const start = lines.indexOf(`UID:${uid}`);
    expect(start).toBeGreaterThan(-1);
    return lines.slice(start, lines.indexOf("END:VEVENT", start));
  };

  it("gives each service a stable id and its time in UTC", () => {
    const event = eventLines("2026-09-27-AM@faithfulwordmusic.com");
    expect(event).toContain("DTSTART:20260927T173000Z");
    expect(event).toContain("DTEND:20260927T190000Z");
    expect(event).toContain("SUMMARY:Sunday Morning Service");
  });

  it("lists the songs in the event notes, in the shared text's format", () => {
    const description = eventLines("2026-09-27-AM@faithfulwordmusic.com").find((line) =>
      line.startsWith("DESCRIPTION:"),
    );
    expect(description).toMatch(/^DESCRIPTION:#\d+ {2}/);
    expect(description).toContain("https://faithfulwordmusic.com/song-list");
  });

  it("includes only the kinds asked for", () => {
    const wednesdays = buildCalendar([month], parseKinds("wed-pm"), now);
    const summaries = unfold(wednesdays).filter((line) => line.startsWith("SUMMARY:"));
    expect(summaries.length).toBeGreaterThan(0);
    expect(new Set(summaries)).toEqual(new Set(["SUMMARY:Wednesday Evening Service"]));
    expect(events(buildCalendar([month], parseKinds("sun-am,sun-pm"), now))).toBe(
      events(feed) - summaries.length,
    );
  });

  it("puts conference meetings under special meetings", () => {
    expect(events(buildCalendar([conference], parseKinds("sun-am,sun-pm,wed-pm"), now))).toBe(0);
    const special = unfold(buildCalendar([conference], parseKinds("special"), now));
    expect(special).toContain("SUMMARY:Thursday Evening Service");
  });
});
