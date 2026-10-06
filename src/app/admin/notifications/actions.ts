"use server";

import { revalidatePath } from "next/cache";

import { notificationsContent } from "@/content/notifications";
import { ACTION_ERRORS, withPermission, type ActionResult } from "@/lib/auth/session";
import { MANUAL_AUDIENCES, SEND_PERMISSION } from "@/lib/notifications/manual";
import {
  deleteTemplate,
  duplicateTemplate,
  listAnnouncements,
  previewAnnouncement,
  saveTemplate,
  sendAnnouncement,
  type AnnouncementPage,
  type AnnouncementPreview,
  type AnnouncementProblem,
  type NamedLabels,
  type TemplateProblem,
} from "@/lib/notifications/manual-service";
import { manualDeps } from "@/lib/notifications/manual-store";

/**
 * Admin -> Notifications: previewing and sending an announcement, the older
 * pages of the history, and the templates (send_notifications).
 *
 * Each goes through withPermission(), and the rules in manual-service.ts
 * check the permission again and validate every argument: the title, the
 * message, the link, the priority and every part of the audience. Nothing a
 * browser says about WHO would receive a notification is taken - sending
 * takes the chosen audience and works the people out again, here.
 *
 * Policies are not here: they need manage_notifications
 * (setNotificationPoliciesAction in ../actions.ts).
 */

const copy = notificationsContent.center;

const NAMED = Object.fromEntries(MANUAL_AUDIENCES.map((key) => [key, copy.audiences[key].label])) as NamedLabels;

const SEND_ERRORS: Record<AnnouncementProblem, string> = {
  forbidden: ACTION_ERRORS.forbidden,
  title: copy.errors.title,
  body: copy.errors.body,
  link: copy.errors.link,
  priority: copy.errors.priority,
  audience: copy.errors.audience,
  stale: copy.errors.stale,
  nobody: copy.errors.nobody,
  unavailable: copy.errors.unavailable,
};

const TEMPLATE_ERRORS: Record<TemplateProblem, string> = {
  forbidden: ACTION_ERRORS.forbidden,
  name: copy.errors.name,
  title: copy.errors.title,
  body: copy.errors.templateBody,
  link: copy.errors.link,
  priority: copy.errors.priority,
  audience: copy.errors.templateAudience,
  "not-found": copy.errors.notFound,
  "too-many": copy.errors.tooMany,
};

/** Who a draft would reach if it were sent now. Writes nothing. */
export async function previewAnnouncementAction(draft: unknown): Promise<ActionResult<AnnouncementPreview>> {
  return withPermission(SEND_PERMISSION, async (viewer) => {
    const result = await previewAnnouncement(viewer, draft, NAMED, manualDeps(viewer.env));
    return result.ok ? { ok: true, value: result.preview } : { ok: false, error: SEND_ERRORS[result.problem] };
  });
}

/**
 * Sends an announcement now. An error here means nothing was sent to anyone:
 * unlike a feature's notification, which is best effort, this one is the
 * whole point of the action, so a failure is said. What became of each push
 * is not part of the answer - that is recorded per device afterwards.
 */
export async function sendAnnouncementAction(draft: unknown, templateId: unknown = null): Promise<ActionResult<{ eventId: number; recipients: number }>> {
  return withPermission(SEND_PERMISSION, async (viewer) => {
    let result;
    try {
      result = await sendAnnouncement(viewer, { draft, templateId }, NAMED, manualDeps(viewer.env));
    } catch (error) {
      console.error("[notifications] An announcement could not be sent:", error instanceof Error ? error.message : "unknown error");
      return { ok: false, error: SEND_ERRORS.unavailable };
    }
    if (!result.ok) return { ok: false, error: SEND_ERRORS[result.problem] };
    revalidatePath("/admin/notifications/history");
    return { ok: true, value: { eventId: result.eventId, recipients: result.recipients } };
  });
}

/** The next page of the history, older than `before`. */
export async function loadAnnouncementsAction(before: unknown): Promise<ActionResult<AnnouncementPage>> {
  return withPermission(SEND_PERMISSION, async (viewer) => {
    const page = await listAnnouncements(viewer, { before }, manualDeps(viewer.env));
    return page ? { ok: true, value: page } : { ok: false, error: ACTION_ERRORS.forbidden };
  });
}

/** Keeps a draft as a new template, or replaces template `id`'s contents. Nothing is sent. */
export async function saveTemplateAction(input: { id?: unknown; name: unknown; draft: unknown }): Promise<ActionResult<{ id: number }>> {
  return withPermission(SEND_PERMISSION, async (viewer) => {
    const fields = input && typeof input === "object" ? input : { name: null, draft: null };
    const result = await saveTemplate(viewer, fields, manualDeps(viewer.env));
    if (!result.ok) return { ok: false, error: TEMPLATE_ERRORS[result.problem] };
    revalidatePath("/admin/notifications/templates");
    const updated = fields.id !== undefined && fields.id !== null;
    return { ok: true, value: { id: result.id }, message: updated ? copy.template.updated : copy.template.saved };
  });
}

export async function duplicateTemplateAction(id: unknown): Promise<ActionResult> {
  return withPermission(SEND_PERMISSION, async (viewer) => {
    const rename = (name: string) => copy.templates.copyName.replace("{name}", name);
    const result = await duplicateTemplate(viewer, { id, rename }, manualDeps(viewer.env));
    if (!result.ok) return { ok: false, error: TEMPLATE_ERRORS[result.problem] };
    revalidatePath("/admin/notifications/templates");
    return { ok: true, value: null, message: copy.templates.duplicated };
  });
}

/** Deletes a template. What was sent from it keeps its own record. */
export async function deleteTemplateAction(id: unknown): Promise<ActionResult> {
  return withPermission(SEND_PERMISSION, async (viewer) => {
    const result = await deleteTemplate(viewer, id, manualDeps(viewer.env));
    if (!result.ok) return { ok: false, error: TEMPLATE_ERRORS[result.problem] };
    revalidatePath("/admin/notifications/templates");
    return { ok: true, value: null, message: copy.templates.deleted };
  });
}
