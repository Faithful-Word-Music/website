"use client";

import { useId, useState } from "react";

import { deleteTemplateAction, duplicateTemplateAction, saveTemplateAction } from "@/app/admin/notifications/actions";
import { ActionMessage, TextField } from "@/components/account/fields";
import { Pill } from "@/components/admin/StatusPill";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { useAction } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import { notificationsContent } from "@/content/notifications";
import { formatDate } from "@/lib/auth/format";
import { EMPTY_SELECTION, MANUAL_AUDIENCES, MANUAL_LIMITS, describeSelection, type AudienceSelection } from "@/lib/notifications/manual";
import type { ComposerOptions, NotificationTemplate } from "@/lib/notifications/manual-service";
import { plural } from "@/lib/plural";

import { AnnouncementFields, EMPTY_MESSAGE, linkIsValid, type MessageFields } from "./AnnouncementFields";
import { AudiencePicker } from "./AudiencePicker";
import { AudienceSummary } from "./AudienceSummary";

const copy = notificationsContent.center;
const text = copy.templates;
const words = feedbackContent;

const NAMED = Object.fromEntries(MANUAL_AUDIENCES.map((key) => [key, copy.audiences[key].label])) as Record<(typeof MANUAL_AUDIENCES)[number], string>;

interface Editing {
  /** Null for a new template. */
  id: number | null;
  name: string;
  message: MessageFields;
  audience: AudienceSelection;
}

const NEW: Editing = { id: null, name: "", message: EMPTY_MESSAGE, audience: EMPTY_SELECTION };

/**
 * Admin -> Notifications -> Templates: the messages kept to start from.
 *
 * "Use" opens the composer with a COPY of the template (a link, so nothing
 * happens until the person sends). Editing here changes the template and
 * nothing else: every notification already sent keeps its own record of what
 * it said, and deleting a template deletes no history.
 */
export function TemplateManager({
  templates,
  options,
  names,
}: {
  templates: NotificationTemplate[];
  options: ComposerOptions;
  /** Clerk user ID -> name, for who last changed each. */
  names: Record<string, string>;
}) {
  const id = useId();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const list = useAction();
  const form = useAction();

  const savable = editing !== null && editing.name.trim() !== "" && editing.message.title.trim() !== "" && linkIsValid(editing.message.actionUrl);

  function open(next: Editing) {
    form.clear();
    list.clear();
    setDeleting(null);
    setEditing(next);
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="tnum text-sm text-muted">{templates.length > 0 ? plural(text.count, templates.length) : null}</p>
        <Button type="button" disabled={templates.length >= MANUAL_LIMITS.templates} onClick={() => open(NEW)}>
          {text.create}
        </Button>
      </div>

      {templates.length === 0 ? (
        <p className="mt-6 max-w-2xl text-muted">{text.empty}</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {templates.map((template) => {
            const { draft } = template;
            const who = names[template.updatedBy ?? ""];
            return (
              <li key={template.id}>
                <Card className="p-4 sm:p-6">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h2 className="break-words font-display text-xl text-ink">{template.name}</h2>
                    {draft.priority !== "normal" ? <Pill tone="warning">{copy.priorities[draft.priority].label}</Pill> : null}
                  </div>
                  <p className="mt-3 break-words text-sm font-semibold text-ink">{draft.title}</p>
                  <p className="mt-0.5 line-clamp-3 whitespace-pre-line break-words text-sm text-muted">{draft.body || text.noBody}</p>
                  {draft.actionUrl ? (
                    <p className="mt-2 break-all text-xs text-muted">
                      {copy.review.destination} {draft.actionUrl}
                    </p>
                  ) : null}
                  <div className="mt-3">
                    <AudienceSummary labels={describeSelection(draft.audience, NAMED, options)} empty={text.noAudience} />
                  </div>
                  <p className="tnum mt-3 text-xs text-muted">
                    {text.changed.replace("{date}", formatDate(template.updatedAt))}
                    {who ? ` ${text.by.replace("{name}", who)}` : ""}
                  </p>

                  {deleting === template.id ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-ink">{text.confirmDelete}</span>
                      <Button
                        type="button"
                        state={list.stateOf(`delete:${template.id}`)}
                        pendingLabel={words.deleting}
                        doneLabel={words.deleted}
                        disabled={list.pending}
                        onClick={() => void list.run(() => deleteTemplateAction(template.id), { key: `delete:${template.id}`, toast: true, onOk: () => setDeleting(null) })}
                      >
                        {text.confirmYes}
                      </Button>
                      <Button type="button" variant="quiet" onClick={() => setDeleting(null)}>
                        {text.confirmNo}
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-2">
                      <ButtonLink href={`/admin/notifications?template=${template.id}`} className="mr-2">
                        {text.use}
                      </ButtonLink>
                      <Button
                        type="button"
                        variant="quiet"
                        disabled={list.pending}
                        onClick={() =>
                          open({
                            id: template.id,
                            name: template.name,
                            message: { title: draft.title, body: draft.body, actionUrl: draft.actionUrl ?? "", priority: draft.priority },
                            audience: draft.audience,
                          })
                        }
                      >
                        {text.edit}
                      </Button>
                      <Button
                        type="button"
                        variant="quiet"
                        state={list.stateOf(`duplicate:${template.id}`)}
                        pendingLabel={words.working}
                        doneLabel={words.done}
                        disabled={list.pending || templates.length >= MANUAL_LIMITS.templates}
                        onClick={() => void list.run(() => duplicateTemplateAction(template.id), { key: `duplicate:${template.id}` })}
                      >
                        {text.duplicate}
                      </Button>
                      <Button
                        type="button"
                        variant="quiet"
                        disabled={list.pending}
                        onClick={() => {
                          list.clear();
                          setDeleting(template.id);
                        }}
                      >
                        {text.delete}
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3">
        <ActionMessage result={list.result} />
      </div>

      {editing ? (
        <Modal
          title={editing.id === null ? text.createTitle : text.editTitle}
          closeLabel={copy.template.cancel}
          size="lg"
          onClose={() => setEditing(null)}
          footer={
            <>
              <ActionMessage result={form.result} />
              <Button type="button" variant="quiet" onClick={() => setEditing(null)}>
                {copy.template.cancel}
              </Button>
              <Button
                type="button"
                state={form.stateOf()}
                pendingLabel={words.saving}
                doneLabel={words.saved}
                disabled={form.pending || !savable}
                onClick={() =>
                  void form.run(
                    () => saveTemplateAction({ ...(editing.id === null ? {} : { id: editing.id }), name: editing.name, draft: { ...editing.message, audience: editing.audience } }),
                    { toast: true, onOk: () => setEditing(null) },
                  )
                }
              >
                {copy.template.save}
              </Button>
            </>
          }
        >
          <TextField
            id={`${id}-name`}
            label={copy.template.nameLabel}
            placeholder={copy.template.namePlaceholder}
            value={editing.name}
            maxLength={MANUAL_LIMITS.templateNameChars}
            onChange={(name) => setEditing({ ...editing, name })}
          />
          <AnnouncementFields id={`${id}-message`} value={editing.message} onChange={(patch) => setEditing({ ...editing, message: { ...editing.message, ...patch } })} />
          <div>
            <h3 className="font-display text-lg text-ink">{copy.compose.audienceHeading}</h3>
            <p className="mb-4 mt-1 text-sm text-muted">{copy.compose.audienceLead}</p>
            <AudiencePicker id={`${id}-audience`} options={options} value={editing.audience} onChange={(audience) => setEditing({ ...editing, audience })} />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
