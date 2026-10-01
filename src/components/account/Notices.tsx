import Link from "next/link";
import type { ReactNode } from "react";

import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { accountContent } from "@/content/account";

/** A quiet bordered message, in the style of the contact form's alerts. */
export function Notice({
  title,
  children,
  tone = "neutral",
  className,
}: {
  title?: string;
  children?: ReactNode;
  tone?: "neutral" | "warning" | "success";
  className?: string;
}) {
  return (
    <div
      role={tone === "warning" ? "alert" : "status"}
      className={cn(
        "rounded-card border bg-surface px-4 py-3 text-sm text-ink",
        tone === "warning" ? "border-gold-dark" : "border-line",
        tone === "success" && "border-l-2 border-l-gold",
        className,
      )}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      {children ? <div className={cn("text-muted", title && "mt-1")}>{children}</div> : null}
    </div>
  );
}

/** Shown in place of the login and invitation screens when accounts cannot work here. */
export function AccountsUnavailable() {
  return (
    <Card className="p-6 text-center sm:p-8">
      <p className="font-display text-xl text-ink">{accountContent.unavailable.title}</p>
      <p className="mx-auto mt-3 max-w-sm text-muted">{accountContent.unavailable.body}</p>
    </Card>
  );
}

/** A signed-in person who lacks the permission for a page. */
export function NoAccess() {
  return (
    <Card className="p-6 text-center sm:p-10">
      <p className="font-display text-2xl text-ink">You do not have access to this page</p>
      <p className="mx-auto mt-3 max-w-md text-muted">
        Your account does not include permission for this area. If you think it should, ask the music ministry to
        update your role.
      </p>
      <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <ButtonLink href="/dashboard">Back to Dashboard</ButtonLink>
      </div>
    </Card>
  );
}

/** "Don't have an account? Request one!" - only "Request one!" is a link. */
export function RequestAccountPrompt({ className }: { className?: string }) {
  return (
    <p className={cn("text-center text-sm text-muted", className)}>
      {accountContent.login.noAccount}{" "}
      <Link
        href="/request-access"
        className="text-ink underline decoration-gold underline-offset-4 transition-colors hover:text-gold-dark"
      >
        {accountContent.login.requestLink}
      </Link>
    </p>
  );
}
