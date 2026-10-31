"use client";

import Link from "next/link";

import { useAccount } from "@/components/account/AccountContext";
import { cn } from "@/components/ui/cn";
import type { Category, RequestType } from "@/lib/support/model";

/**
 * "Report a problem" (or "Request sheet music") from a page about something:
 * opens the Support Center's form already pointing at it. Only for someone
 * signed in who may send requests - found out in the browser, so cached
 * public pages stay the same for everyone. The link carries references only;
 * the Support Center checks them again before showing or keeping anything.
 */
export function ReportLink({
  entry,
  category,
  refs,
  children,
  className,
}: {
  entry: RequestType;
  category?: Category;
  refs: Record<string, string | number | undefined | null>;
  children: React.ReactNode;
  className?: string;
}) {
  const { isSignedIn, me } = useAccount();
  if (!isSignedIn || !me?.permissions.includes("submit_support_requests")) return null;
  const query = new URLSearchParams({ new: entry, ...(category ? { category } : {}) });
  for (const [key, value] of Object.entries(refs)) if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  return (
    <Link
      href={`/contact?${query.toString()}`}
      className={cn("text-xs text-muted underline decoration-transparent underline-offset-4 transition-colors hover:text-ink hover:decoration-gold", className)}
    >
      {children}
    </Link>
  );
}
