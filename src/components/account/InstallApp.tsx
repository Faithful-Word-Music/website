"use client";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { accountContent } from "@/content/account";
import { detectInstallMode, INSTALL_PROMPT_EVENT, INSTALL_PROMPT_KEY, type InstallMode } from "@/lib/install";

/**
 * "Install Faithful Word Music" - for signed-in members only, and only on a
 * device where installing makes sense (src/lib/install.ts):
 *   - Chromium: a button that opens the browser's own install dialog
 *   - iPhone/iPad and Safari on a Mac: the same button shows the steps, since
 *     those browsers cannot be asked to install (or, in an iOS browser that
 *     cannot add to the Home Screen, how to get there through Safari)
 *   - already running as the app: nothing
 *   - anywhere else (older Chrome, Firefox): no button, but /account still
 *     explains installing from the browser's own menu
 *
 * InstallAppSection lives on /account; InstallAppCard is the Dashboard's
 * dismissible reminder.
 */

const copy = accountContent.install;

/** The part of Chromium's BeforeInstallPromptEvent used here (not in the DOM types). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallWindow = Window & { [INSTALL_PROMPT_KEY]?: InstallPromptEvent | null };

const STANDALONE_QUERY = "(display-mode: standalone)";

function storedPrompt(): InstallPromptEvent | null {
  return (window as InstallWindow)[INSTALL_PROMPT_KEY] ?? null;
}

function subscribeInstall(onChange: () => void) {
  const standalone = window.matchMedia(STANDALONE_QUERY);
  window.addEventListener(INSTALL_PROMPT_EVENT, onChange);
  window.addEventListener("appinstalled", onChange);
  standalone.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(INSTALL_PROMPT_EVENT, onChange);
    window.removeEventListener("appinstalled", onChange);
    standalone.removeEventListener("change", onChange);
  };
}

function installSnapshot(): InstallMode {
  return detectInstallMode({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone:
      window.matchMedia(STANDALONE_QUERY).matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    hasPrompt: storedPrompt() !== null,
  });
}

/**
 * The server (and the first render in the browser) shows nothing, as if
 * installed; the device decides straight after.
 */
function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribeInstall, installSnapshot, () => "installed");
}

type OfferedMode = Exclude<InstallMode, "installed" | "none">;

/** Opens Chromium's install dialog. The event works once, so it is let go either way. */
async function promptInstall() {
  const event = storedPrompt();
  if (!event) return;
  (window as InstallWindow)[INSTALL_PROMPT_KEY] = null;
  try {
    await event.prompt();
    await event.userChoice;
  } finally {
    // Chromium fires a fresh beforeinstallprompt if installing is still possible.
    window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT));
  }
}

/** Whether installing should be offered here at all. */
function useOfferedMode(): OfferedMode | null {
  const { isSignedIn } = useAccount();
  const mode = useInstallMode();
  if (!isSignedIn || mode === "installed" || mode === "none") return null;
  return mode;
}

/**
 * The Install button, or (where the browser cannot be asked) the button that
 * reveals the steps beneath it. `beside` sits next to the button.
 */
function InstallAction({ mode, beside }: { mode: OfferedMode; beside?: ReactNode }) {
  const [showSteps, setShowSteps] = useState(false);
  const stepsId = useId();

  if (mode === "prompt") {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button onClick={() => void promptInstall()}>{copy.button}</Button>
        {beside}
      </div>
    );
  }

  const guide = { ios: copy.ios, "ios-open-safari": copy.iosOpenSafari, "mac-safari": copy.macSafari }[mode];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button aria-expanded={showSteps} aria-controls={stepsId} onClick={() => setShowSteps((open) => !open)}>
          {showSteps ? copy.hideSteps : copy.button}
        </Button>
        {beside}
      </div>
      <div id={stepsId} hidden={!showSteps} className="mt-4 text-sm text-ink-soft">
        <p>{guide.intro}</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * /account: "Install the app", everywhere but inside the installed app. Where
 * there is no button to press, the older-phone note says how to install from
 * the browser's own menu.
 */
export function InstallAppSection({ className }: { className?: string }) {
  const { isSignedIn } = useAccount();
  const mode = useInstallMode();
  const headingId = useId();
  if (!isSignedIn || mode === "installed") return null;

  return (
    <section aria-labelledby={headingId} className={className}>
      <Card className="p-5 sm:p-6">
        <h2 id={headingId} className="font-display text-xl text-ink">
          {copy.title}
        </h2>
        <p className="mt-1 text-sm text-muted">{copy.lead}</p>
        {mode !== "none" ? (
          <div className="mt-4">
            <InstallAction mode={mode} />
          </div>
        ) : null}
        {mode !== "prompt" ? (
          <div className="mt-4 border-t border-line pt-4 text-sm">
            <p className="font-medium text-ink">{copy.olderPhone.title}</p>
            <p className="mt-1 text-muted">{copy.olderPhone.body}</p>
          </div>
        ) : null}
      </Card>
    </section>
  );
}

/*
 * The Dashboard card can be put away for good on this device. Remembered in
 * localStorage, which may be unavailable (private browsing, blocked storage):
 * then the card simply comes back next time.
 */
const DISMISS_KEY = "install-card-dismissed";
const DISMISS_EVENT = "fwm:install-card-dismissed";

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

/** /dashboard: a short reminder that the app can be installed on this device. */
export function InstallAppCard({ className }: { className?: string }) {
  const mode = useOfferedMode();
  const [hiddenHere, setHiddenHere] = useState(false);
  const dismissed = useSyncExternalStore(subscribeDismissed, dismissedSnapshot, () => true);
  if (!mode || dismissed || hiddenHere) return null;

  return (
    <Card barline className={cn("px-5 py-4 sm:px-6", className)}>
      <p className="font-medium text-ink">{copy.cardTitle}</p>
      <p className="mt-0.5 text-sm text-muted">{copy.cardDetail}</p>
      <div className="mt-4">
        <InstallAction
          mode={mode}
          beside={
            <button
              type="button"
              aria-label={copy.dismissLabel}
              onClick={() => {
                setHiddenHere(true);
                dismissCard();
              }}
              className="min-h-11 text-sm text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              {copy.dismiss}
            </button>
          }
        />
      </div>
    </Card>
  );
}
