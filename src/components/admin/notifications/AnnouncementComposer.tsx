"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { previewAnnouncementAction, saveTemplateAction, sendAnnouncementAction } from "@/app/admin/notifications/actions";
import { ActionMessage, TextField } from "@/components/account/fields";
import { Notice } from "@/components/account/Notices";
import { SectionLabel } from "@/components/account/ProfileView";
import { refreshUnread } from "@/components/notifications/notification-store";
import { NotificationSample } from "@/components/notifications/NotificationList";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { useAction } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import { notificationsContent } from "@/content/notifications";
import { EMPTY_SELECTION, MANUAL_LIMITS, isEmptySelection, type AnnouncementDraft, type AudienceSelection } from "@/lib/notifications/manual";
import type { AnnouncementPreview, ComposerOptions, LoadedDraft } from "@/lib/notifications/manual-service";
import { plural } from "@/lib/plural";

import { AnnouncementFields, EMPTY_MESSAGE, linkIsValid, type MessageFields } from "./AnnouncementFields";
import { AudiencePicker } from "./AudiencePicker";
import { AudienceSummary } from "./AudienceSummary";

const copy = notificationsContent.center;
const words = feedbackContent;

/** Where the composer's draft came from, for the line that says so. */
export type DraftSource = "template" | "history";

/** The announcement category's key: what the preview's icon is drawn from. */
const CATEGORY = "admin_announcement";

const messageOf = (draft: AnnouncementDraft): MessageFields => ({
  title: draft.title,
  body: draft.body,
  actionUrl: draft.actionUrl ?? "",
  priority: draft.priority,
});

/**
 * Admin -> Notifications -> Send: write a notification, choose who receives
 * it, look at it, and send it.
 *
 * Three steps, so nothing is sent by accident:
 *
 *   compose   the message and the audience
 *   review    the server says who it would reach right now, and shows it as
 *             it will appear; only here is there a Send button
 *   sent      how many people were told
 *
 * The review is for the person's eyes only. Sending hands over the DRAFT, and
 * the server works out the people again (sendAnnouncement) - the list shown
 * here is never sent back.
 *
 * A draft started from a template or an old send is a copy: editing it
 * changes neither. Keeping it as a template is its own button and never
 * happens by itself.
 *
 * How it reaches each person - in the app, by push - is not chosen here. That
 * is the Announcements policy and each person's own settings.
 */
export function AnnouncementComposer({
  options,
  initial,
  source,
  missing = false,
}: {
  options: ComposerOptions;
  initial?: LoadedDraft;
  source?: DraftSource;
  /** A template or send was asked for and could not be found. */
  missing?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [message, setMessage] = useState<MessageFields>(initial ? messageOf(initial.draft) : EMPTY_MESSAGE);
  const [audience, setAudience] = useState<AudienceSelection>(initial?.draft.audience ?? EMPTY_SELECTION);
  const [template, setTemplate] = useState(initial?.template ?? null);
  const [preview, setPreview] = useState<AnnouncementPreview | null>(null);
  const [sent, setSent] = useState<{ eventId: number; recipients: number } | null>(null);
  const [showPeople, setShowPeople] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templateName, setTemplateName] = useState(initial?.template?.name ?? "");
  const send = useAction();
  const keep = useAction();

  // Each step replaces the last, which may leave the page scrolled past its top: bring the new one into view.
  const top = useRef<HTMLDivElement>(null);
  const step = sent ? "sent" : preview ? "review" : "compose";
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    top.current?.scrollIntoView({ block: "start" });
  }, [step]);
  const anchor = <div ref={top} className="scroll-mt-28" />;

  const draft = { ...message, audience };
  const ready = message.title.trim() !== "" && message.body.trim() !== "" && linkIsValid(message.actionUrl) && !isEmptySelection(audience);
  const keepable = message.title.trim() !== "" && linkIsValid(message.actionUrl);

  function edit(patch: Partial<MessageFields>) {
    send.clear();
    setMessage((now) => ({ ...now, ...patch }));
  }

  function startOver() {
    setMessage(EMPTY_MESSAGE);
    setAudience(EMPTY_SELECTION);
    setTemplate(null);
    setTemplateName("");
    setPreview(null);
    setSent(null);
    setShowPeople(false);
    send.clear();
    // Drops ?template= or ?from= so a reload does not bring the old draft back.
    router.replace("/admin/notifications");
  }

  if (sent) {
    return (
      <>
        {anchor}
        <Card className="mt-8 p-6 sm:p-8">
          <SectionLabel>{copy.sent.title}</SectionLabel>
          <p role="status" className="mt-2 font-display text-2xl text-ink">
            {plural(copy.sent.body, sent.recipients)}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-muted">{copy.sent.note}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ButtonLink href={`/admin/notifications/history/${sent.eventId}`}>{copy.sent.viewHistory}</ButtonLink>
            <Button type="button" variant="secondary" onClick={startOver}>
              {copy.sent.another}
            </Button>
          </div>
        </Card>
      </>
    );
  }

  if (preview) {
    const count = preview.people.length;
    return (
      <>
        {anchor}
        <div className="mt-8 space-y-6">
          <Card className="p-4 sm:p-6">
            <h2 className="font-display text-2xl text-ink">{copy.review.title}</h2>
            <p className="mt-1 text-sm text-muted">{copy.review.lead}</p>

            <p className="mb-2 mt-6 text-sm font-medium text-ink">{copy.review.previewLabel}</p>
            <div className="overflow-hidden rounded-lg border border-line">
              <NotificationSample
                category={CATEGORY}
                title={preview.draft.title}
                body={preview.draft.body}
                important={preview.draft.priority !== "normal"}
                when={copy.review.now}
              />
            </div>

            <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="font-medium text-ink">{copy.review.destination}</dt>
              <dd className="break-all text-muted">{preview.draft.actionUrl ?? copy.review.noDestination}</dd>
              <dt className="font-medium text-ink">{copy.compose.priorityLabel}</dt>
              <dd className="text-muted">{copy.priorities[preview.draft.priority].label}</dd>
              <dt className="font-medium text-ink">{copy.review.audience}</dt>
              <dd>
                <AudienceSummary labels={preview.labels} />
              </dd>
            </dl>
          </Card>

          <Card barline className="p-4 sm:p-6">
            {count === 0 ? (
              <p role="alert" className="text-gold-dark">
                {copy.review.nobody}
              </p>
            ) : (
              <>
                <p role="status" className="font-display text-xl text-ink">
                  {plural(copy.review.recipients, count)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {plural(copy.review.push, preview.push)} {copy.review.pushNote}
                </p>
                {preview.optedOut > 0 ? <p className="mt-1 text-sm text-muted">{plural(copy.review.optedOut, preview.optedOut)}</p> : null}
                <div className="-ml-5 mt-1">
                  <Button type="button" variant="quiet" aria-expanded={showPeople} aria-controls={`${id}-people`} onClick={() => setShowPeople((now) => !now)}>
                    {showPeople ? copy.review.hidePeople : copy.review.showPeople}
                  </Button>
                </div>
                {showPeople ? (
                  <ul id={`${id}-people`} className="mt-1 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-ink sm:grid-cols-2 lg:grid-cols-3">
                    {preview.people.map((person) => (
                      <li key={person.id} className="truncate">
                        {person.name || copy.review.unnamed}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="lg"
                state={send.stateOf("send")}
                pendingLabel={words.sending}
                doneLabel={words.sent}
                disabled={send.pending || count === 0}
                onClick={() =>
                  void send.run(() => sendAnnouncementAction(draft, template?.id ?? null), {
                    key: "send",
                    // Nothing on this page changed; the bell is asked at once, since the sender may be among those told.
                    refresh: false,
                    onOk: (outcome) => {
                      if (!outcome.ok) return;
                      setSent(outcome.value);
                      void refreshUnread();
                    },
                  })
                }
              >
                {plural(copy.review.send, count)}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={send.pending}
                onClick={() => {
                  send.clear();
                  setPreview(null);
                  setShowPeople(false);
                }}
              >
                {copy.review.back}
              </Button>
            </div>
            <div className="mt-3">
              <ActionMessage result={send.result} />
            </div>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      {anchor}
      <form
        className="mt-8 space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void send.run(() => previewAnnouncementAction(draft), {
            key: "review",
            refresh: false,
            onOk: (outcome) => {
              if (outcome.ok) setPreview(outcome.value);
            },
          });
        }}
      >
        {missing ? <Notice tone="warning">{copy.compose.notFound}</Notice> : null}
        {initial && source ? (
          <Notice>
            {source === "template" && template ? copy.compose.fromTemplate.replace("{name}", template.name) : copy.compose.fromHistory}
            {initial.dropped ? ` ${copy.compose.dropped}` : null}
          </Notice>
        ) : null}

        <Card className="p-4 sm:p-6">
          <h2 className="mb-5 font-display text-xl text-ink">{copy.compose.messageHeading}</h2>
          <AnnouncementFields id={`${id}-message`} value={message} onChange={edit} />
        </Card>

        <Card className="p-4 sm:p-6">
          <h2 className="font-display text-xl text-ink">{copy.compose.audienceHeading}</h2>
          <p className="mb-5 mt-1 text-sm text-muted">{copy.compose.audienceLead}</p>
          <AudiencePicker
            id={`${id}-audience`}
            options={options}
            value={audience}
            onChange={(next) => {
              send.clear();
              setAudience(next);
            }}
          />
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" state={send.stateOf("review")} pendingLabel={copy.compose.reviewing} disabled={send.pending || !ready}>
            {copy.compose.review}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={send.pending || !keepable}
            onClick={() => {
              keep.clear();
              setSaving(true);
            }}
          >
            {copy.template.saveAs}
          </Button>
          <Button type="button" variant="quiet" disabled={send.pending} onClick={startOver}>
            {copy.compose.reset}
          </Button>
        </div>
        <ActionMessage result={send.result} />
      </form>

      {/* Outside the form: Enter in the name field must not ask for a review. */}
      {saving ? (
        <Modal
          title={copy.template.saveTitle}
          subtitle={copy.template.saveLead}
          closeLabel={copy.template.cancel}
          onClose={() => setSaving(false)}
          footer={
            <>
              <Button type="button" variant="quiet" onClick={() => setSaving(false)}>
                {copy.template.cancel}
              </Button>
              {template ? (
                <Button
                  type="button"
                  variant="secondary"
                  state={keep.stateOf("update")}
                  pendingLabel={words.updating}
                  doneLabel={words.updated}
                  disabled={keep.pending || templateName.trim() === ""}
                  onClick={() =>
                    void keep.run(() => saveTemplateAction({ id: template.id, name: templateName, draft }), {
                      key: "update",
                      refresh: false,
                      toast: true,
                      onOk: () => {
                        setTemplate({ id: template.id, name: templateName.trim() });
                        setSaving(false);
                      },
                    })
                  }
                >
                  {copy.template.update}
                </Button>
              ) : null}
              <Button
                type="button"
                state={keep.stateOf("save")}
                pendingLabel={words.saving}
                doneLabel={words.saved}
                disabled={keep.pending || templateName.trim() === ""}
                onClick={() =>
                  void keep.run(() => saveTemplateAction({ name: templateName, draft }), {
                    key: "save",
                    refresh: false,
                    toast: true,
                    onOk: () => setSaving(false),
                  })
                }
              >
                {copy.template.save}
              </Button>
            </>
          }
        >
          <TextField
            id={`${id}-template-name`}
            label={copy.template.nameLabel}
            placeholder={copy.template.namePlaceholder}
            value={templateName}
            maxLength={MANUAL_LIMITS.templateNameChars}
            onChange={setTemplateName}
          />
          <ActionMessage result={keep.result} />
        </Modal>
      ) : null}
    </>
  );
}
