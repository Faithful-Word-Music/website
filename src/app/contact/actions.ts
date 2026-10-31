"use server";

import { revalidatePath } from "next/cache";

import { supportContent } from "@/content/support";
import { ACTION_ERRORS, withPermission, type ActionResult } from "@/lib/auth/session";
import { usesSupport } from "@/lib/support/access";
import { searchSongs, serviceSongChoices, songFileChoices, type SongChoice } from "@/lib/support/context-load";
import { supportDeps } from "@/lib/support/deps";
import { requestHref } from "@/lib/support/model";
import { createRequest, reply, updateWorkflow, type CreateInput, type ReplyInput, type SupportProblem, type WorkflowInput } from "@/lib/support/service";

/**
 * The Support Center's actions (docs/support-center.md). Every one runs for
 * the signed-in person only, and the rules in src/lib/support/service.ts
 * check their permission and their relation to the request again - who
 * wrote a reply, whether it may be an internal note, and what a manager may
 * change are never taken from what the page sent.
 */

const errors = supportContent.errors;

const PROBLEMS: Record<SupportProblem, string> = {
  forbidden: errors.forbidden,
  invalid: errors.invalid,
  "not-found": errors.notFound,
  context: errors.context,
  changed: errors.contextChanged,
  conflict: errors.conflict,
  closed: errors.closed,
};

const refuse = (problem: SupportProblem): { ok: false; error: string } => ({ ok: false, error: PROBLEMS[problem] });

export async function createSupportRequestAction(input: CreateInput): Promise<ActionResult<{ publicId: string; href: string }>> {
  return withPermission(null, async (viewer) => {
    const result = await createRequest(viewer, input, supportDeps(viewer.env));
    if (!result.ok) return refuse(result.problem);
    revalidatePath("/contact");
    const { publicId } = result.request;
    return { ok: true, value: { publicId, href: requestHref(publicId) }, message: supportContent.form.sent.replace("{id}", publicId) };
  });
}

export async function replySupportRequestAction(input: ReplyInput): Promise<ActionResult> {
  return withPermission(null, async (viewer) => {
    const result = await reply(viewer, input, supportDeps(viewer.env));
    if (!result.ok) return refuse(result.problem);
    revalidatePath("/contact");
    return { ok: true, value: null, message: input.visibility === "internal" ? supportContent.reply.noteSaved : supportContent.reply.sent };
  });
}

export async function updateSupportWorkflowAction(input: WorkflowInput): Promise<ActionResult<{ revision: number }>> {
  return withPermission(null, async (viewer) => {
    const result = await updateWorkflow(viewer, input, supportDeps(viewer.env));
    if (!result.ok) return refuse(result.problem);
    revalidatePath("/contact");
    return { ok: true, value: { revision: result.revision }, message: supportContent.manage.saved };
  });
}

// ---------------------------------------------------------------------------
// The form's choices - each checked like the context it leads to
// ---------------------------------------------------------------------------

export async function supportServiceSongsAction(anchor: unknown): Promise<ActionResult<SongChoice[]>> {
  return withPermission(null, async (viewer) => {
    if (!usesSupport(viewer)) return { ok: false, error: ACTION_ERRORS.forbidden };
    if (typeof anchor !== "string" || !/^\d{4}-\d{2}-\d{2}-(am|pm)$/.test(anchor)) return refuse("invalid");
    const songs = await serviceSongChoices(viewer.env, viewer, anchor);
    return songs ? { ok: true, value: songs } : refuse("context");
  });
}

export async function supportSongSearchAction(query: unknown): Promise<ActionResult<Awaited<ReturnType<typeof searchSongs>>>> {
  return withPermission(null, async (viewer) => {
    if (!usesSupport(viewer)) return { ok: false, error: ACTION_ERRORS.forbidden };
    if (typeof query !== "string" || query.length > 80) return refuse("invalid");
    return { ok: true, value: await searchSongs(query) };
  });
}

export async function supportSongFilesAction(songId: unknown): Promise<ActionResult<Awaited<ReturnType<typeof songFileChoices>>>> {
  return withPermission(null, async (viewer) => {
    if (!usesSupport(viewer)) return { ok: false, error: ACTION_ERRORS.forbidden };
    if (typeof songId !== "string" || songId.length > 200) return refuse("invalid");
    return { ok: true, value: await songFileChoices(viewer, songId) };
  });
}
