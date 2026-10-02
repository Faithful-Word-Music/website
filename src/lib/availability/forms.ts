import { z } from "zod";

import { clerkUserIdSchema } from "@/lib/auth/forms";
import { SERVICE_AVAILABILITY } from "@/lib/auth/profile-options";

import { NOTE_LIMIT } from "./effective";
import { daysBetween, isDateString } from "./occurrences";
import { MAX_RANGE_DAYS } from "./range";

/**
 * Validation for the availability forms. The server actions parse with
 * these; nothing a browser sends is trusted as-is. A `userId` is only ever
 * a request to manage someone else - who may do that is decided by
 * availabilityTarget() (access.ts), never by its presence here.
 */

const date = z.string().refine(isDateString, "Please choose a valid date.");
const slot = z.enum(["AM", "PM"]);
const userId = clerkUserIdSchema.optional();
const note = z
  .string()
  .trim()
  .max(NOTE_LIMIT, `Please keep the note under ${NOTE_LIMIT} characters.`)
  .optional()
  .transform((value) => value || null);

export const serviceExceptionSchema = z.object({
  date,
  slot,
  status: z.enum(["available", "unavailable", "normal"]),
  note,
  userId,
});

export const rangeSchema = z
  .object({
    from: date,
    to: date,
    status: z.enum(["available", "unavailable", "normal"]),
    note,
    userId,
  })
  .refine((value) => value.from <= value.to, { message: "The end date must be on or after the start date.", path: ["to"] })
  .refine((value) => daysBetween(value.from, value.to) < MAX_RANGE_DAYS, {
    message: `Please choose a range of at most ${MAX_RANGE_DAYS} days.`,
    path: ["to"],
  });

const services = SERVICE_AVAILABILITY.map((option) => option.value) as [
  (typeof SERVICE_AVAILABILITY)[number]["value"],
  ...(typeof SERVICE_AVAILABILITY)[number]["value"][],
];

export const normalAvailabilitySchema = z.object({
  services: z
    .array(z.enum(services))
    .max(SERVICE_AVAILABILITY.length)
    .transform((values) => [...new Set(values)]),
  userId,
});

export type ServiceExceptionInput = z.input<typeof serviceExceptionSchema>;
export type RangeInput = z.input<typeof rangeSchema>;
export type NormalAvailabilityInput = z.input<typeof normalAvailabilitySchema>;
