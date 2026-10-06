"use client";

import { ChoiceChips, TextField } from "@/components/account/fields";
import { cn } from "@/components/ui/cn";
import { notificationsContent } from "@/content/notifications";
import { DESTINATION_SUGGESTIONS, DRAFT_LIMITS } from "@/lib/notifications/manual";
import { PRIORITIES, safeActionUrl, type NotificationPriority } from "@/lib/notifications/model";

const copy = notificationsContent.center;
const text = copy.compose;

/** What the composer and the template editor both edit of a message. The link is as typed. */
export interface MessageFields {
  title: string;
  body: string;
  actionUrl: string;
  priority: NotificationPriority;
}

export const EMPTY_MESSAGE: MessageFields = { title: "", body: "", actionUrl: "", priority: "normal" };

/** Whether a typed link could be sent: empty, or a page on this site. */
export function linkIsValid(value: string): boolean {
  return safeActionUrl(value.trim()) !== undefined;
}

const left = (limit: number, value: string) => text.charsLeft.replace("{left}", String(Math.max(limit - value.length, 0)));

/**
 * The message itself: its title, what it says, where it leads and how much
 * it matters. Shared by the composer and the template editor, so a template
 * holds exactly what a notification can.
 *
 * The limits are the notification system's own (NOTIFICATION_LIMITS); the
 * server checks every one of them again.
 */
export function AnnouncementFields({ id, value, onChange }: { id: string; value: MessageFields; onChange: (patch: Partial<MessageFields>) => void }) {
  const linkError = linkIsValid(value.actionUrl) ? undefined : text.linkInvalid;
  const linkHelpId = `${id}-link-help`;

  return (
    <div className="space-y-5">
      <TextField
        id={`${id}-title`}
        label={text.titleLabel}
        hint={left(DRAFT_LIMITS.title, value.title)}
        placeholder={text.titlePlaceholder}
        value={value.title}
        maxLength={DRAFT_LIMITS.title}
        onChange={(title) => onChange({ title })}
      />
      <TextField
        id={`${id}-body`}
        label={text.bodyLabel}
        hint={left(DRAFT_LIMITS.body, value.body)}
        placeholder={text.bodyPlaceholder}
        value={value.body}
        maxLength={DRAFT_LIMITS.body}
        multiline
        rows={6}
        onChange={(body) => onChange({ body })}
      />

      <div>
        <label htmlFor={`${id}-link`} className="mb-1.5 flex items-baseline justify-between gap-3 text-sm font-medium text-ink">
          {text.linkLabel}
          <span className="text-xs font-normal text-muted">{text.linkHint}</span>
        </label>
        <input
          id={`${id}-link`}
          list={`${id}-link-options`}
          value={value.actionUrl}
          placeholder={text.linkPlaceholder}
          maxLength={DRAFT_LIMITS.link}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={linkError ? true : undefined}
          aria-describedby={linkHelpId}
          onChange={(event) => onChange({ actionUrl: event.target.value })}
          className={cn(
            "w-full rounded-lg border bg-surface px-4 py-3 text-base text-ink placeholder:text-muted transition-colors",
            linkError ? "border-gold-dark" : "border-line hover:border-muted/50",
          )}
        />
        <datalist id={`${id}-link-options`}>
          {DESTINATION_SUGGESTIONS.map((path) => (
            <option key={path} value={path} />
          ))}
        </datalist>
        <p id={linkHelpId} role={linkError ? "alert" : undefined} className={cn("mt-1.5 text-sm", linkError ? "text-gold-dark" : "text-muted")}>
          {linkError ?? text.linkHelp}
        </p>
      </div>

      <div>
        <ChoiceChips
          name={`${id}-priority`}
          legend={text.priorityLabel}
          options={PRIORITIES.map((priority) => ({ value: priority, label: copy.priorities[priority].label }))}
          selected={[value.priority]}
          // One is always chosen: pressing the chosen one again leaves it.
          onChange={(next) => onChange({ priority: next[0] ?? value.priority })}
        />
        <p className="mt-2 text-sm text-muted">
          {copy.priorities[value.priority].detail} {value.priority === "normal" ? copy.priorityNote : null}
        </p>
      </div>
    </div>
  );
}
