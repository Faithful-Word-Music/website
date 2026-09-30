"use client";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/**
 * Something failed while loading this page - usually Clerk or the database
 * being briefly unreachable. The details are in the server logs, never here.
 */
export default function AccountError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-14 pt-10 sm:px-8">
      <Card className="p-6 text-center sm:p-10">
        <p className="font-display text-2xl text-ink">This page could not be loaded</p>
        <p className="mx-auto mt-3 max-w-md text-muted">
          Something went wrong on our end. Please try again in a moment.
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <ButtonLink href="/" variant="secondary">
            Back to Home
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
