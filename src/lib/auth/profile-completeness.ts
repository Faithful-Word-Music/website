import { MUSICIAN_ROLE, SONG_LEADER_ROLE } from "./permissions";

/**
 * What is still missing from someone's profile, as short prompts. The
 * questions asked depend on their roles: musicians are asked about their
 * instruments and how they read music, song leaders whether they read sheet
 * music.
 */
export function missingProfileItems(input: {
  roleKeys: readonly string[];
  hasName: boolean;
  hasImage: boolean;
  instrumentCount: number;
  learningStyle: number | null;
  theoryLevel: string | null;
  readsSheetMusic: boolean | null;
}): string[] {
  const missing: string[] = [];
  if (!input.hasName) missing.push("Your first and last name");
  if (!input.hasImage) missing.push("A profile photo");

  if (input.roleKeys.includes(MUSICIAN_ROLE)) {
    if (input.instrumentCount === 0) missing.push("The instruments you play");
    if (input.learningStyle === null) missing.push("How you learn music (by ear or from sheet music)");
    if (input.theoryLevel === null) missing.push("Your music theory level");
  }
  if (input.roleKeys.includes(SONG_LEADER_ROLE) && input.readsSheetMusic === null) {
    missing.push("Whether you read basic sheet music");
  }
  return missing;
}
