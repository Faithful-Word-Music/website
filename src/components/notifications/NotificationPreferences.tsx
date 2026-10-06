"use client";

import { useState } from "react";

import { setNotificationPreferenceAction } from "@/app/notifications/actions";
import { ActionMessage } from "@/components/account/fields";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/StatusIcons";
import { useAction } from "@/components/ui/use-action";
import { notificationsContent } from "@/content/notifications";
import { CHANNELS, CHANNEL_STATUS, type Channel, type EffectiveSetting } from "@/lib/notifications/model";
import type { CategoryPreferences } from "@/lib/notifications/service";

const copy = notificationsContent.settings;
const channelCopy = notificationsContent.channels;

/**
 * A person's notification settings: every kind of notification, and for each
 * channel either a switch (their choice), "Always on" (required - with a
 * lock, and said in words, never just a greyed-out switch) or "Coming soon" /
 * "Not available" (nothing to choose).
 *
 * A switch saves as it is pressed and shows the new position at once; if the
 * server refuses, it goes back and says why.
 */
export function NotificationPreferences({ categories }: { categories: CategoryPreferences[] }) {
  const { pending, result, run, stateOf } = useAction();
  // Each switch pressed here, in its new position: the page's own data follows a moment later.
  const [pressed, setPressed] = useState<Record<string, boolean>>({});

  if (categories.length === 0) return <p className="text-muted">{copy.empty}</p>;

  function toggle(category: string, channel: Channel, enabled: boolean) {
    const key = `${category}:${channel}`;
    setPressed((now) => ({ ...now, [key]: enabled }));
    void run(
      async () => {
        const outcome = await setNotificationPreferenceAction(category, channel, enabled);
        // Refused: back to where it was.
        if (!outcome.ok) setPressed((now) => Object.fromEntries(Object.entries(now).filter(([name]) => name !== key)));
        return outcome;
      },
      { key },
    );
  }

  return (
    <div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        {CHANNELS.map((channel) => (
          <div key={channel}>
            <dt className="font-medium text-ink">{channelCopy[channel].name}</dt>
            <dd className="mt-0.5 text-muted">{channelCopy[channel].detail}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 min-h-6">
        <ActionMessage result={result?.ok ? null : result} />
      </div>

      <ul className="mt-3 space-y-4">
        {categories.map((category) => (
          <li key={category.key}>
            <Card className="p-4 sm:p-5">
              <h2 className="font-display text-xl text-ink">{category.name}</h2>
              {category.description ? <p className="mt-1 text-sm text-muted">{category.description}</p> : null}
              <ul className="mt-4 grid grid-cols-1 gap-x-6 border-t border-line sm:grid-cols-3 sm:border-t-0">
                {CHANNELS.map((channel) => {
                  const key = `${category.key}:${channel}`;
                  const setting = category.channels[channel];
                  const enabled = pressed[key] ?? setting.enabled;
                  return (
                    <li
                      key={channel}
                      className="flex min-h-12 items-center justify-between gap-3 border-b border-line py-2 sm:flex-col sm:items-start sm:justify-start sm:gap-1.5 sm:border-b-0 sm:border-t sm:pt-3"
                    >
                      <span className="text-sm font-medium text-ink">{channelCopy[channel].name}</span>
                      <ChannelControl
                        channel={channel}
                        setting={setting}
                        enabled={enabled}
                        busy={stateOf(key) === "pending"}
                        disabled={pending}
                        label={copy.switchLabel.replace("{category}", category.name).replace("{channel}", channelCopy[channel].name)}
                        onChange={(next) => toggle(category.key, channel, next)}
                      />
                    </li>
                  );
                })}
              </ul>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChannelControl({
  channel,
  setting,
  enabled,
  busy,
  disabled,
  label,
  onChange,
}: {
  channel: Channel;
  setting: EffectiveSetting;
  enabled: boolean;
  busy: boolean;
  disabled: boolean;
  label: string;
  onChange: (enabled: boolean) => void;
}) {
  // Nothing to choose: say why, in words.
  if (!setting.available) {
    return <span className="text-sm text-muted">{CHANNEL_STATUS[channel] === "soon" ? copy.comingSoon : copy.unavailable}</span>;
  }
  if (setting.locked) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-ink" title={copy.requiredDetail}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-gold-dark">
          <path d="M4 7.5h8v6H4zM5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>
          {copy.required}
          <span className="sr-only">. {copy.requiredDetail}</span>
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed",
          enabled ? "border-ink bg-ink" : "border-line bg-paper not-disabled:hover:border-muted",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "block h-5 w-5 rounded-full transition-transform",
            enabled ? "translate-x-[1.375rem] bg-paper" : "translate-x-0.5 bg-muted",
          )}
        />
      </button>
      <span aria-hidden="true" className="inline-flex min-w-8 items-center text-sm text-muted">
        {busy ? <Spinner /> : enabled ? copy.on : copy.off}
      </span>
    </span>
  );
}
