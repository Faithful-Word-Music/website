import { MUSICIAN_ROLE } from "./permissions";

/**
 * What is still missing from someone's profile, as short prompts. Everyone
 * is asked whether they read sheet music and about music theory; musicians
 * are also asked which instruments they play and how they play (by ear or
 * from sheet music).
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
  if (input.readsSheetMusic === null) missing.push("Whether you read sheet music");
  if (input.theoryLevel === null) missing.push("Your music theory level");

  if (input.roleKeys.includes(MUSICIAN_ROLE)) {
    if (input.instrumentCount === 0) missing.push("The instruments you play");
    if (input.learningStyle === null) missing.push("How you play (by ear or from sheet music)");
  }
  return missing;
}
