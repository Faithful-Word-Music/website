"use client";

import Link from "next/link";

import { footerContent } from "@/content/footer";

/**
 * Next.js does not scroll when a link points at the page already open - so
 * "Log in!" at the bottom of /login would seem to do nothing. Scroll up instead.
 */
function scrollUpIfCurrent(event: React.MouseEvent<HTMLAnchorElement>) {
  if (event.currentTarget.pathname !== window.location.pathname) return;
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * "Have an account? Log in!" - only "Log in!" is the link. The last line of
 * the footer's navigation for a visitor (FooterNav.tsx); someone signed in
 * has the Dashboard there instead.
 */
export function FooterLoginLink() {
  return (
    <p className="flex min-h-9 flex-wrap items-center gap-x-1 text-sm text-muted">
      {footerContent.account.prompt}
      <Link
        href="/login"
        className="text-ink underline decoration-gold underline-offset-4 transition-colors hover:text-gold-dark"
        onClick={scrollUpIfCurrent}
      >
        {footerContent.account.login}
      </Link>
    </p>
  );
}
