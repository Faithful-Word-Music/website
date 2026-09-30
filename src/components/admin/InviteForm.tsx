"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { inviteAction } from "@/app/admin/actions";
import { ActionMessage, TextField } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import type { ActionResult } from "@/lib/auth/session";

/** Invite someone directly, without an account request first. */
export function InviteForm() {
  const ids = useId();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    startTransition(async () => {
      const outcome = await inviteAction(email);
      setResult(outcome);
      if (outcome.ok) {
        setEmail("");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <TextField
            id={`${ids}-email`}
            label="Email address"
            placeholder="name@example.com"
            type="email"
            value={email}
            maxLength={254}
            onChange={setEmail}
          />
        </div>
        <Button type="submit" size="lg" disabled={pending || !email.trim()}>
          {pending ? "Sending…" : "Send invitation"}
        </Button>
      </div>
      <ActionMessage result={result} />
    </form>
  );
}
