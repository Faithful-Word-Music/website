"use client";

import Link from "next/link";

import { useAccount } from "@/components/account/AccountContext";
import { FooterLoginLink } from "@/components/account/FooterAccountLink";
import { flatNav, primaryNav } from "@/lib/navigation";

/**
 * The footer's navigation list: the same links as the header (the public
 * ones for visitors, the Dashboard and the rest once signed in), with the
 * header's menus opened out into their links. A visitor's list ends with the
 * way in - the only place the site offers it. Until Clerk has loaded that is
 * what shows, which is what the static page holds.
 */
export function FooterNav() {
  const { nav } = useAccount();
  return (
    <ul className="mt-4 space-y-1">
      {flatNav(primaryNav(nav)).map((item) => (
        <li key={item.href}>
          <Link href={item.href} className="inline-flex min-h-9 items-center text-sm text-muted transition-colors hover:text-ink">
            {item.label}
          </Link>
        </li>
      ))}
      {nav.signedIn ? null : (
        <li>
          <FooterLoginLink />
        </li>
      )}
    </ul>
  );
}
