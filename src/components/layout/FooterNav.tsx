"use client";

import Link from "next/link";

import { useAccount } from "@/components/account/AccountContext";
import { primaryNav } from "@/lib/navigation";

/**
 * The footer's navigation list: the same links as the header (the public
 * ones for visitors, the Dashboard and the rest once signed in).
 */
export function FooterNav() {
  const { nav } = useAccount();
  return (
    <ul className="mt-4 space-y-1">
      {primaryNav(nav).map((item) => (
        <li key={item.href}>
          <Link href={item.href} className="inline-flex min-h-9 items-center text-sm text-muted transition-colors hover:text-ink">
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
