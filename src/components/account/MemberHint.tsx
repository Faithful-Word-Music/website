"use client";

import { useEffect } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { usePagePath } from "@/components/ui/use-page-path";
import { MEMBER_ATTRIBUTE } from "@/lib/member-hint";
import { isMemberPath } from "@/lib/navigation";

/**
 * Keeps <html data-member> (src/lib/member-hint.ts) true to the session.
 * Until Clerk has loaded, the <head> script's guess from the cookie stands;
 * from then on Clerk decides - so logging in or out switches the footer
 * without a reload, and a stale cookie is put right. Renders nothing.
 */
export function MemberHint() {
  const { isLoaded, isSignedIn } = useAccount();
  const pathname = usePagePath();
  const member = isSignedIn || isMemberPath(pathname);

  useEffect(() => {
    if (!isLoaded) return;
    document.documentElement.toggleAttribute(MEMBER_ATTRIBUTE, member);
  }, [isLoaded, member]);

  return null;
}
