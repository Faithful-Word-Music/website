"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useUnsavedGuard } from "@/components/ui/use-unsaved-guard";
import { profileSetupContent } from "@/content/profile-setup";

const copy = profileSetupContent.sections.leave;

/**
 * The site's unsaved-changes guard (use-unsaved-guard.ts: links anywhere on
 * the site, Back and Forward, reloading and closing) with its question asked
 * in the site's own dialog. One per page, however many forms it covers.
 */
export function UnsavedChangesPrompt({ dirty }: { dirty: boolean }) {
  const guard = useUnsavedGuard(dirty);
  return guard.pending ? <LeaveDialog onStay={guard.stay} onLeave={guard.leave} /> : null;
}

/** "Leave without saving?" - shared with onboarding's own step links, which stay on the same page. */
export function LeaveDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return (
    <Modal
      title={copy.title}
      closeLabel={copy.stay}
      onClose={onStay}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onStay}>
            {copy.stay}
          </Button>
          <Button type="button" onClick={onLeave}>
            {copy.leave}
          </Button>
        </>
      }
    >
      <p className="text-ink-soft">{copy.body}</p>
    </Modal>
  );
}
