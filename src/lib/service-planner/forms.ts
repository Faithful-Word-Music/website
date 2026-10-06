import { z } from "zod";

import { isDateString } from "@/lib/availability/occurrences";

/**
 * Validation for every Service Planner action. The server actions parse with
 * these; nothing a browser sends is trusted as-is.
 */

/** The most places one service may have. */
export const MAX_PLACES = 20;

const text = (max: number, label: string) =>
  z.string().trim().max(max, `Please keep ${label} under ${max} characters.`);

const optional = (max: number, label: string) =>
  text(max, label)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

export const anchorSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}-(am|pm)$/, "That is not a service.");
const slotSchema = z.enum(["AM", "PM"]);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Please give the time as HH:MM.");
const dateSchema = z.string().refine(isDateString, "Please give a real date.");

export const songSchema = z.object({
  title: text(200, "the title").min(1, "Every song needs a title."),
  number: optional(20, "the hymn number"),
  key: optional(30, "the key"),
  /** Sent by the editor, and not believed: whether a song is an insert is read off its number (planSong). */
  insert: z.boolean().optional(),
});

export const saveServiceSchema = z.object({
  anchor: anchorSchema,
  /** The revision the browser started from; null for a service not stored yet. */
  revision: z.number().int().positive().nullable(),
  slots: z.array(songSchema.nullable()).max(MAX_PLACES, `A service can have at most ${MAX_PLACES} places.`),
  label: optional(80, "the name"),
  time: timeSchema.nullable().optional(),
  publish: z.boolean().optional(),
});

export const publishSchema = z.object({
  anchors: z.array(anchorSchema).min(1, "Choose at least one service.").max(60),
});

export const statusSchema = z.object({
  anchor: anchorSchema,
  status: z.enum(["draft", "cancelled"]),
});

export const specialServiceSchema = z.object({
  date: dateSchema,
  slot: slotSchema,
  label: text(80, "the name").min(1, "Please name the service."),
  time: timeSchema,
  songs: z.number().int().min(0).max(MAX_PLACES),
});

export const insertWeekSchema = z.object({
  weekStart: dateSchema,
  /** Which of the week's inserts: 1, or 2 for the optional second. */
  index: z.union([z.literal(1), z.literal(2)]).optional().default(1),
  song: z
    .object({
      title: text(200, "the title").min(1),
      number: optional(20, "the hymn number"),
      key: optional(30, "the key"),
    })
    .nullable(),
});

export const newSongSchema = z.object({
  title: text(200, "the title").min(1, "Please enter the song's title."),
  number: optional(20, "the hymn number"),
  collection: optional(120, "the collection"),
  defaultKey: optional(30, "the key"),
});
