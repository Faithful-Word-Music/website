"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { copyrightLine, DeveloperCredit } from "@/components/layout/FooterCredit";
import { disconnectForSignOut } from "@/components/notifications/push-device";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/Modal";
import { Popover } from "@/components/ui/popover/Popover";
import { usePagePath } from "@/components/ui/use-page-path";
import { accountContent } from "@/content/account";
import { profileSetupContent } from "@/content/profile-setup";
import { accountMenu, isActivePath } from "@/lib/navigation";

/**
 * Log out. This device stops receiving the person's push notifications first
 * (push-device.ts), while there is still a session to say whose device it
 * is - so nothing addressed to them can reach whoever uses this browser next.
 * That never holds up signing out for more than a moment.
 */
async function logOut(signOut: (options: { redirectUrl: string }) => Promise<void>) {
  await disconnectForSignOut();
  await signOut({ redirectUrl: "/" });
}

/**
 * The signed-in person's menu in the header: their photo, on every screen.
 * It holds their Notifications, Profile, Account settings, the admin area (if
 * they may use it) and Log out. Editing lives on the pages themselves, not
 * here.
 *
 *   wide (the header's links in a row)  a panel under the photo - a button
 *                                       and a list of links (a disclosure,
 *                                       not an ARIA menu)
 *   narrow (phones, tablets)            a sheet rising from the foot of the
 *                                       screen (Modal's sheet)
 *
 * `wide` comes from the header's own measure of whether its links fit
 * (use-nav-fit.ts), so the account menu changes form exactly when the bar
 * does. If that happens while it is open it closes, and focus goes back to
 * the photo.
 *
 * Renders nothing for visitors who are not signed in - the public header
 * looks exactly as it always has. Which links show comes from
 * src/lib/navigation.ts and the person's permissions (/api/account/me); it is
 * only a convenience, and every page checks permissions again itself.
 */
export function UserMenu({ wide }: { wide: boolean }) {
  const { isSignedIn, me } = useAccount();
  const { user } = useUser();
  const pathname = usePagePath();
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  const [lastWide, setLastWide] = useState(wide);
  /** Whether it was open as of the last render on screen: read when a change of width closes it. */
  const wasOpen = useRef(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }
  if (wide !== lastWide) {
    setLastWide(wide);
    setOpen(false);
  }

  // A change of width closed it while open: focus back to the photo - but only
  // if the closing left focus nowhere, never taking it from where the person
  // put it. (Before the effect below, so it still sees the open state.)
  useEffect(() => {
    if (!wasOpen.current) return;
    const active = document.activeElement;
    if (!active || active === document.body) buttonRef.current?.focus({ preventScroll: true });
  }, [wide]);
  useEffect(() => {
    wasOpen.current = open;
  });

  if (!isSignedIn || !user) return null;

  const name = user.fullName || user.primaryEmailAddress?.emailAddress || "Your account";
  const attention = !!me && me.profileAttention !== "none";
  const close = () => setOpen(false);

  return (
    <div className="relative shrink-0 print:hidden">
      <button
        ref={buttonRef}
        type="button"
        // The sheet is a dialog; the panel is a disclosure of links.
        aria-haspopup={wide ? undefined : "dialog"}
        aria-expanded={open}
        aria-controls={open && wide ? menuId : undefined}
        aria-label={attention ? `${accountContent.menu.button} - ${profileSetupContent.status.menuMarker}` : accountContent.menu.button}
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-paper"
      >
        {attention ? (
          <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-gold-dark" />
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element -- Clerk-hosted avatar, already sized by Clerk */}
        <img src={user.imageUrl} alt="" width={28} height={28} className="h-7 w-7 rounded-full border border-line object-cover" />
      </button>

      {open && wide ? (
        <Popover id={menuId} triggerRef={buttonRef} onClose={close} placement="bottom-end" className="w-64 p-2">
          <div className="border-b border-line px-3 pb-3 pt-2">
            <p className="truncate text-sm font-medium text-ink">{name}</p>
            {me?.title ? (
              <p className="truncate text-xs text-gold-dark">{me.title}</p>
            ) : (
              <p className="truncate text-xs text-muted">{user.primaryEmailAddress?.emailAddress}</p>
            )}
          </div>
          <AccountLinks variant="popover" onNavigate={close} />
          <AppCredit />
        </Popover>
      ) : null}

      {open && !wide ? (
        <Modal
          sheet
          title={name}
          subtitle={me?.title ?? user.primaryEmailAddress?.emailAddress}
          closeLabel={accountContent.menu.close}
          onClose={close}
          bare
          bodyClassName="p-2"
        >
          <nav aria-label={accountContent.menu.button}>
            <AccountLinks variant="sheet" onNavigate={close} />
          </nav>
          <AppCredit />
        </Modal>
      ) : null}
    </div>
  );
}

/**
 * The account links and Log out: the same list in the panel and the sheet.
 * Which links come from accountMenu(nav) - the person's permissions - and
 * nothing here grants anything: every page checks again on the server.
 */
function AccountLinks({ variant, onNavigate }: { variant: "popover" | "sheet"; onNavigate: () => void }) {
  const { me, nav } = useAccount();
  const { signOut } = useClerk();
  const pathname = usePagePath();
  const row = cn(
    "flex w-full items-center rounded-control px-3 text-left text-ink transition-colors hover:bg-paper",
    variant === "sheet" ? "min-h-12 text-base" : "min-h-11 text-sm",
  );

  return (
    <ul className={variant === "popover" ? "pt-2" : undefined}>
      {accountMenu(nav).map((item) => {
        const current = isActivePath(pathname, item.href);
        return (
          <li key={item.href}>
            <Link href={item.href} onClick={onNavigate} aria-current={current ? "page" : undefined} className={cn(row, current && "bg-paper")}>
              {item.label}
              {item.href === "/profile" ? <ProfileMarker state={me?.profileAttention} /> : null}
            </Link>
          </li>
        );
      })}
      <li className="mt-1 border-t border-line pt-1">
        <button type="button" onClick={() => void logOut(signOut)} className={cn(row, "text-muted hover:text-ink")}>
          {accountContent.menu.logout}
        </button>
      </li>
    </ul>
  );
}

/**
 * The footer's closing line, for the installed app only: a member has no
 * footer there (globals.css), so the copyright and credit live here instead.
 * In a browser the footer has them and this stays hidden.
 */
function AppCredit() {
  return (
    <div className="mt-1 hidden border-t border-line px-3 pb-1 pt-3 text-xs leading-relaxed text-muted standalone:block">
      <p>{copyrightLine()}</p>
      <p>
        <DeveloperCredit />
      </p>
    </div>
  );
}

/** A small gold dot beside Profile while the profile needs something; said in words for screen readers. */
function ProfileMarker({ state }: { state: "none" | "due" | "blocked" | undefined }) {
  if (!state || state === "none") return null;
  return (
    <>
      <span aria-hidden="true" className="ml-2 inline-block h-2 w-2 rounded-full bg-gold-dark" />
      <span className="sr-only"> ({profileSetupContent.status.menuMarker})</span>
    </>
  );
}
