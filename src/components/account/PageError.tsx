"use client";

import { BackButton } from "@/components/ui/BackLink";
import { Button } from "@/components/ui/Button";

/**
 * Something failed while loading a signed-in page - usually Clerk or the
 * database being briefly unreachable. The details are in the server logs,
 * never here. Used as the error.tsx of the Dashboard, Profile, Account,
 * Admin, Availability and Service Planner areas, and styled like the 404
 * page (src/app/not-found.tsx), so the two read as one family.
 */
export function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto w-full max-w-3xl px-5 pb-24 pt-16 text-center sm:px-8 sm:pb-32 sm:pt-24">
      <p className="font-display text-sm uppercase tracking-[0.2em] text-gold-dark">Something went wrong</p>
      <h1 className="mt-4 font-display text-4xl text-ink sm:text-5xl">This page could not be loaded</h1>
      <p className="mx-auto mt-5 max-w-md text-lg text-muted">
        It is most likely a brief hiccup on our end. Please try again in a moment.
      </p>
      <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button type="button" size="lg" onClick={reset}>
          Try again
        </Button>
        <BackButton fallback="/dashboard" variant="secondary" size="lg" />
      </div>
    </div>
  );
}
