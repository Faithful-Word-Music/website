import Link from "next/link";

import { copyrightLine, DeveloperCredit } from "@/components/layout/FooterCredit";
import { Container } from "@/components/ui/Container";
import { footerContent } from "@/content/footer";

/**
 * The footer signed-in members see, on every page: one quiet line, as in the
 * rest of the app - the copyright, Support (the Support Center, /contact, which
 * decides on the server what each person may use) and the developer credit.
 * No brand block, navigation or resources; the header already has those.
 *
 * Every page renders it beside the full Footer, and globals.css shows one of
 * them (src/lib/member-hint.ts) - so the public pages stay static. Inside the
 * installed app neither shows for a member; the account menu carries the
 * closing line there instead (UserMenu.tsx).
 *
 * The bottom right corner belongs to the floating buttons ("Back to top" and
 * Conductor's), so, as in the full footer:
 *
 *   phones       copyright · Support, then the credit beneath
 *   to 1439px    all three on one line from the left, dots between
 *   from 1440px  copyright · Support left, the credit right
 */
export function AppFooter() {
  return (
    <footer data-footer="app" aria-label={footerContent.app.label} className="mt-16 border-t border-line">
      <Container
        size="wide"
        className="flex flex-col gap-1 py-5 text-xs text-muted sm:flex-row sm:items-center sm:gap-x-3 min-[1440px]:justify-between"
      >
        <div className="flex items-center gap-x-3">
          <p>{copyrightLine()}</p>
          <span aria-hidden="true" className="text-staff">
            ·
          </span>
          <Link
            href={footerContent.app.supportHref}
            className="inline-flex min-h-9 items-center text-muted transition-colors hover:text-ink"
          >
            {footerContent.app.support}
          </Link>
        </div>
        {/* Bounded on both sides, as in Footer.tsx. */}
        <span aria-hidden="true" className="hidden text-staff sm:max-[1440px]:inline">
          ·
        </span>
        <p className="flex min-h-9 items-center sm:min-h-0">
          <span>
            <DeveloperCredit />
          </span>
        </p>
      </Container>
    </footer>
  );
}
