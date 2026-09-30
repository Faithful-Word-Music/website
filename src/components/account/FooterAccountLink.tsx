"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

import { footerContent } from "@/content/footer";

const linkClass =
  "text-ink underline decoration-gold underline-offset-4 transition-colors hover:text-gold-dark";

/**
 * Next.js does not scroll when a link points at the page already open - so
 * "Log in!" at the bottom of /login would seem to do nothing. Scroll up instead.
 */
function scrollUpIfCurrent(event: React.MouseEvent<HTMLAnchorElement>) {
  if (event.currentTarget.pathname !== window.location.pathname) return;
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/** "Have an account? Log in!" - only "Log in!" is the link. */
export function FooterLoginLink() {
  return (
    <p className="text-xs text-muted">
      {footerContent.account.prompt}{" "}
      <Link href="/login" className={linkClass} onClick={scrollUpIfCurrent}>
        {footerContent.account.login}
      </Link>
    </p>
  );
}

/**
 * The footer's account link once accounts are switched on: the login prompt
 * for visitors, a link to their account for someone signed in. Until Clerk
 * has loaded it shows the login prompt, which is what the static page holds.
 */
export function FooterAccountLink() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || !isSignedIn) return <FooterLoginLink />;
  return (
    <p className="text-xs text-muted">
      {footerContent.account.signedIn}{" "}
      <Link href="/account" className={linkClass} onClick={scrollUpIfCurrent}>
        {footerContent.account.account}
      </Link>
    </p>
  );
}
