import { z } from "zod";

import { anchorSchema } from "@/lib/service-planner/forms";
import { PLACE_ID_PATTERN } from "@/lib/service-planner/places";

/**
 * Validation for every recording action. Nothing the browser sends is
 * trusted: an address is parsed again on the server (providers.ts, links.ts),
 * and embed HTML is never accepted - only addresses.
 */

const text = (max: number, label: string) => z.string().trim().max(max, `Please keep ${label} under ${max} characters.`);

const optional = (max: number, label: string) =>
  text(max, label)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

const songId = text(2048, "the song ID").min(1, "Which song is this for?");
const id = z.string().uuid("That recording is not known.");
const visibility = z.enum(["public", "members"]).default("public");
const url = text(2048, "the address").min(1, "Please paste the address.");

const details = {
  title: text(200, "the title").min(1, "Please give the recording a title."),
  sourceName: optional(120, "the source"),
  description: optional(1000, "the description"),
  arrangement: optional(120, "the arrangement"),
  musicKey: optional(30, "the key"),
  visibility,
};

export const lookupSchema = z.object({ url });

export const addRecordingSchema = z.object({ songId, url, ...details });

export const updateRecordingSchema = z.object({ id, ...details });

export const deleteSchema = z.object({ id });

export const primarySchema = z.object({ songId, recordingId: id.nullable() });

export const linkSchema = z.object({
  title: text(200, "the title").min(1, "Please give the link a title."),
  url,
  description: optional(1000, "the description"),
  visibility,
});

export const addLinkSchema = linkSchema.extend({ songId });

export const updateLinkSchema = linkSchema.extend({ id });

export const serviceRecordingSchema = z.object({
  anchor: anchorSchema,
  placeId: z.string().regex(PLACE_ID_PATTERN, "That song is not in the service any more."),
  planRevision: z.number().int().min(1),
  recordingId: id.nullable(),
});
