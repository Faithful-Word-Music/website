"use client";

import { useState } from "react";

import { sendTestNotificationAction, setNotificationPoliciesAction } from "@/app/admin/actions";
import { ActionMessage } from "@/components/account/fields";
import { SectionLabel } from "@/components/account/ProfileView";
import { Pill } from "@/components/admin/StatusPill";
import { refreshUnread } from "@/components/notifications/notification-store";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAction } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import { notificationsContent } from "@/content/notifications";
import { CHANNELS, type CategoryPolicies, type Channel, type ChannelPolicy } from "@/lib/notifications/model";
import type { CategoryPolicyView } from "@/lib/notifications/service";

const copy = notificationsContent.admin;

const field =
  "min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink transition-colors not-disabled:hover:border-muted/50 disabled:cursor-not-allowed disabled:opacity-60";

type Allowed = Record<string, ChannelPolicy[]>;

/**
 * Every notification category, each with a policy to choose per channel.
 * A category saves by itself, with its own Save button.
 */
export function NotificationPolicyEditor({ categories, allowed }: { categories: CategoryPolicyView[]; allowed: Allowed }) {
  return (
    <>
      <dl className="mt-8 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {(Object.keys(copy.policies) as ChannelPolicy[]).map((policy) => (
          <div key={policy}>
            <dt className="font-medium text-ink">{copy.policies[policy].label}</dt>
            <dd className="mt-0.5 text-muted">{copy.policies[policy].detail}</dd>
          </div>
        ))}
      </dl>
      <ul className="mt-8 space-y-4">
        {categories.map((category) => (
          <li key={category.key}>
            {/* A fresh form once the saved policies change, so "changed" is measured from them. */}
            <CategoryPolicyForm key={JSON.stringify(category.policies)} category={category} allowed={allowed} />
          </li>
        ))}
      </ul>
    </>
  );
}

function CategoryPolicyForm({ category, allowed }: { category: CategoryPolicyView; allowed: Allowed }) {
  const [policies, setPolicies] = useState<CategoryPolicies>(category.policies);
  const { pending, result, clear, run, stateOf } = useAction();
  const changed = CHANNELS.filter((channel) => policies[channel] !== category.policies[channel]);

  return (
    <Card className="p-4 sm:p-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // Only what changed is sent: a channel left alone is not written again.
          void run(() => setNotificationPoliciesAction(category.key, Object.fromEntries(changed.map((channel) => [channel, policies[channel]]))));
        }}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="font-display text-xl text-ink">{category.name}</h2>
          {category.active ? null : <Pill tone="muted">{copy.retired}</Pill>}
        </div>
        {category.description ? <p className="mt-1 text-sm text-muted">{category.description}</p> : null}

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {CHANNELS.map((channel) => (
            <PolicySelect
              key={channel}
              id={`policy-${category.key}-${channel}`}
              channel={channel}
              categoryName={category.name}
              value={policies[channel]}
              // A value saved before a channel's choices narrowed is still shown.
              options={allowed[channel].includes(policies[channel]) ? allowed[channel] : [policies[channel], ...allowed[channel]]}
              onChange={(policy) => {
                clear();
                setPolicies((now) => ({ ...now, [channel]: policy }));
              }}
            />
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            type="submit"
            state={stateOf()}
            pendingLabel={feedbackContent.saving}
            doneLabel={feedbackContent.saved}
            disabled={pending || changed.length === 0}
          >
            {copy.save}
          </Button>
          <ActionMessage result={result} />
        </div>
      </form>
    </Card>
  );
}

function PolicySelect({
  id,
  channel,
  categoryName,
  value,
  options,
  onChange,
}: {
  id: string;
  channel: Channel;
  categoryName: string;
  value: ChannelPolicy;
  options: ChannelPolicy[];
  onChange: (policy: ChannelPolicy) => void;
}) {
  const { name, note } = copy.channels[channel];
  const noteId = `${id}-note`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        <span className="sr-only">{categoryName}: </span>
        {name}
      </label>
      <select
        id={id}
        value={value}
        // Nothing else to choose (email, until it is built): shown, and plainly not changeable.
        disabled={options.length < 2}
        aria-describedby={note ? noteId : undefined}
        onChange={(event) => onChange(event.target.value as ChannelPolicy)}
        className={field}
      >
        {options.map((policy) => (
          <option key={policy} value={policy}>
            {copy.policies[policy].label}
          </option>
        ))}
      </select>
      {note ? (
        <p id={noteId} className="mt-1.5 text-xs text-muted">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Development only: sends the person pressing it one notification, through
 * the same path every real one takes, so the bell can be seen working before
 * any feature sends one. The action refuses outside development.
 */
export function NotificationTest({ categories }: { categories: Array<{ key: string; name: string }> }) {
  const [category, setCategory] = useState(categories[0]?.key ?? "");
  const { pending, result, clear, run, stateOf } = useAction();
  const test = copy.test;

  if (categories.length === 0) return null;

  return (
    <Card className="mt-8 p-4 sm:p-6">
      <SectionLabel>{test.title}</SectionLabel>
      <p className="mt-1 mb-5 text-sm text-muted">{test.body}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-64">
          <label htmlFor="test-notification-category" className="mb-1.5 block text-sm font-medium text-ink">
            {test.category}
          </label>
          <select
            id="test-notification-category"
            value={category}
            onChange={(event) => {
              clear();
              setCategory(event.target.value);
            }}
            className={field}
          >
            {categories.map((item) => (
              <option key={item.key} value={item.key}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="secondary"
          state={stateOf()}
          pendingLabel={feedbackContent.sending}
          doneLabel={feedbackContent.sent}
          disabled={pending}
          // The bell asks again at once, rather than waiting for its next look.
          onClick={() => void run(() => sendTestNotificationAction(category), { refresh: false, onOk: () => void refreshUnread() })}
        >
          {test.button}
        </Button>
      </div>
      <div className="mt-3">
        <ActionMessage result={result} />
      </div>
    </Card>
  );
}
