"use client";

import Link from "next/link";
import { useId, useState, useSyncExternalStore } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { notificationsContent } from "@/content/notifications";

import { disablePush, enablePush, repairPush, usePushDevice } from "./push-device";

const copy = notificationsContent.device;

/**
 * "Push on this device", at the top of the notification settings.
 *
 * This is the DEVICE's side of push, kept apart from the choices beneath it:
 * whether this browser or installed app may receive push at all, which only
 * the person and their browser decide. What is sent, once it may be, is
 * their notification settings - and "Always on" there cannot switch this on.
 *
 * It only ever shows what can be done here: a button to enable where the
 * browser can be asked, words where it cannot (blocked, unsupported, an
 * iPhone outside the installed app). The browser's permission prompt opens
 * from the Enable button being pressed, and from nothing else.
 */
export function PushDeviceSection({ className }: { className?: string }) {
  const { userId } = useAccount();
  const { status, busy, error } = usePushDevice();
  const headingId = useId();
  const words = copy.states[status];
  const on = status === "enabled";

  return (
    <section aria-labelledby={headingId} className={className}>
      <Card className="p-4 sm:p-5">
        <h2 id={headingId} className="font-display text-xl text-ink">
          {copy.title}
        </h2>
        <p className="mt-1 text-sm text-muted">{copy.lead}</p>

        <div className="mt-4 border-t border-line pt-4">
          {/* Said in words, with the dot only beside them: never colour alone. */}
          <p role="status" className="flex items-baseline gap-2.5 text-sm font-medium text-ink">
            <span
              aria-hidden="true"
              className={cn("relative top-[-1px] h-2 w-2 shrink-0 rounded-full", on ? "bg-gold-dark" : "border border-muted")}
            />
            {words.status}
          </p>
          {words.detail ? <p className="mt-1 pl-[1.125rem] text-sm text-muted">{words.detail}</p> : null}

          {userId && (status === "off" || status === "enabled" || status === "needs-repair") ? (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              {status === "off" ? (
                <Button state={busy === "enable" ? "pending" : "idle"} pendingLabel={copy.enabling} disabled={busy !== null} onClick={() => void enablePush(userId)}>
                  {copy.enable}
                </Button>
              ) : null}
              {status === "needs-repair" ? (
                <Button state={busy === "repair" ? "pending" : "idle"} pendingLabel={copy.repairing} disabled={busy !== null} onClick={() => void repairPush(userId)}>
                  {copy.repair}
                </Button>
              ) : null}
              {status === "enabled" || status === "needs-repair" ? (
                <Button
                  variant="secondary"
                  state={busy === "disable" ? "pending" : "idle"}
                  pendingLabel={copy.disabling}
                  disabled={busy !== null}
                  onClick={() => void disablePush()}
                >
                  {copy.disable}
                </Button>
              ) : null}
            </div>
          ) : null}

          {status === "needs-install" ? (
            <p className="mt-3 pl-[1.125rem] text-sm">
              <Link
                href="/account"
                className="text-ink underline decoration-gold underline-offset-4 transition-colors hover:text-gold-dark"
              >
                {copy.installLink}
              </Link>
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="mt-3 text-sm text-ink">
              {error}
            </p>
          ) : null}
        </div>
      </Card>
    </section>
  );
}

/*
 * The Dashboard card can be put away for good on this device, as the install
 * card can (InstallApp.tsx). Remembered in localStorage, which may be
 * unavailable: then the card simply comes back next time.
 */
const DISMISS_KEY = "push-card-dismissed";
const DISMISS_EVENT = "fwm:push-card-dismissed";

function subscribeDismissed(onChange: () => void) {
  window.addEventListener(DISMISS_EVENT, onChange);
  return () => window.removeEventListener(DISMISS_EVENT, onChange);
}

function dismissedSnapshot(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function dismissCard() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Not remembered; hidden for this page only.
  }
  window.dispatchEvent(new Event(DISMISS_EVENT));
}

/**
 * /dashboard: one quiet offer to switch push on. Only where pressing the
 * button can work - push is possible here, not yet on, and not blocked - and
 * never again once it is on, blocked, or put away. Pressing the button is
 * what asks the browser; showing the card asks nothing.
 */
export function PushCard({ className }: { className?: string }) {
  const { userId } = useAccount();
  const { status, busy, error } = usePushDevice();
  const [hiddenHere, setHiddenHere] = useState(false);
  const dismissed = useSyncExternalStore(subscribeDismissed, dismissedSnapshot, () => true);
  if (!userId || status !== "off" || dismissed || hiddenHere) return null;

  return (
    <Card barline className={cn("px-5 py-4 sm:px-6", className)}>
      <p className="font-medium text-ink">{copy.card.title}</p>
      <p className="mt-0.5 text-sm text-muted">{copy.card.detail}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button state={busy === "enable" ? "pending" : "idle"} pendingLabel={copy.enabling} disabled={busy !== null} onClick={() => void enablePush(userId)}>
          {copy.card.button}
        </Button>
        <button
          type="button"
          aria-label={copy.card.dismissLabel}
          onClick={() => {
            setHiddenHere(true);
            dismissCard();
          }}
          className="min-h-11 text-sm text-muted underline decoration-transparent underline-offset-4 transition-colors hover:text-ink hover:decoration-current"
        >
          {copy.card.dismiss}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-ink">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
