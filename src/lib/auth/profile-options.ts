/**
 * The fixed choices on a member's profile, shared by the profile form, the
 * server-side validation and the admin views.
 *
 * Titles and instruments are NOT here: those are lists administrators keep in
 * /admin/profile-options. The defaults below only seed those lists the first
 * time accounts are used.
 */

export const VOICE_PARTS = [
  { value: "soprano", label: "Soprano" },
  { value: "alto", label: "Alto" },
  { value: "tenor", label: "Tenor" },
  { value: "bass", label: "Bass" },
] as const;
export type VoicePart = (typeof VOICE_PARTS)[number]["value"];

/**
 * How a musician learns and plays music: a five-step spectrum rather than a
 * yes/no, because most musicians are somewhere in between.
 */
export const LEARNING_STYLES = [
  { value: 1, label: "By ear only", description: "I learn songs by listening and play without sheet music." },
  { value: 2, label: "Mostly by ear", description: "I play by ear, and sometimes glance at the music." },
  { value: 3, label: "Both equally", description: "I am as comfortable by ear as from sheet music." },
  { value: 4, label: "Mostly from sheet music", description: "I read the music, and can play some things by ear." },
  { value: 5, label: "From sheet music only", description: "I play from the written music." },
] as const;
export type LearningStyle = (typeof LEARNING_STYLES)[number]["value"];

/** Separate from the learning style: reading music and understanding theory are different skills. */
export const THEORY_LEVELS = [
  { value: "none", label: "None", description: "No formal music theory." },
  { value: "basics", label: "Basics", description: "Note names, rhythms and key signatures." },
  { value: "intermediate", label: "Intermediate", description: "Chords, intervals and progressions." },
  { value: "advanced", label: "Advanced", description: "Harmony, voice leading and arranging." },
] as const;
export type TheoryLevel = (typeof THEORY_LEVELS)[number]["value"];

/**
 * How well someone plays an instrument, in terms of what they can do in a
 * service. The stored values never change; only the wording shown does.
 */
export const PROFICIENCIES = [
  { value: "learning", label: "Learning", description: "Still learning, not ready for services yet." },
  { value: "comfortable", label: "Comfortable", description: "Can play along with others." },
  { value: "confident", label: "Confident", description: "Plays most hymns well." },
] as const;
export type Proficiency = (typeof PROFICIENCIES)[number]["value"];

/** Matches the regular services in siteConfig.songList.regularServices, plus special meetings. */
export const SERVICE_AVAILABILITY = [
  { value: "sunday_am", label: "Sunday morning" },
  { value: "sunday_pm", label: "Sunday evening" },
  { value: "wednesday_pm", label: "Wednesday evening" },
  { value: "special", label: "Special services" },
] as const;
export type ServiceAvailability = (typeof SERVICE_AVAILABILITY)[number]["value"];

export const DEFAULT_INSTRUMENTS = [
  "Piano",
  "Organ",
  "Violin",
  "Viola",
  "Cello",
  "Flute",
  "Clarinet",
  "Trumpet",
  "Guitar",
  "Handbells",
];

export const DEFAULT_TITLES = [
  "Music Director",
  "Song Leader",
  "Pianist",
  "Organist",
  "Accompanist",
  "Violinist",
  "Cellist",
];

export const PROFILE_LIMITS = {
  firstName: 60,
  middleName: 60,
  lastName: 60,
  preferredName: 60,
  bio: 500,
  phone: 30,
  optionLabel: 60,
  requestMessage: 1000,
  reviewNote: 500,
  overrideNote: 200,
  roleLabel: 40,
  roleDescription: 200,
} as const;

export function labelOf<T extends { value: string | number; label: string }>(
  options: readonly T[],
  value: T["value"] | null | undefined,
): string | null {
  return options.find((option) => option.value === value)?.label ?? null;
}
