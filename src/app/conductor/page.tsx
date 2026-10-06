import type { Metadata } from "next";

import { NoAccess } from "@/components/account/Notices";
import { ConductorWorkspace } from "@/components/conductor/ConductorWorkspace";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { conductorContent } from "@/content/conductor";
import { requireViewer } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: conductorContent.name,
  description: conductorContent.metaDescription,
  robots: { index: false, follow: false },
};

/**
 * /conductor - Conductor, the site's AI assistant, as a full page: for longer
 * questions and reading back over a conversation. Only for use_ai.
 *
 * It is the same conversation the floating panel shows on every other page
 * (src/components/conductor/), so arriving here from "Open full Conductor"
 * carries on where the panel left off. The questions themselves go to
 * /api/conductor, which checks use_ai again.
 */
export default async function ConductorPage() {
  const viewer = await requireViewer("/conductor");
  if (!viewer.can("use_ai")) {
    return (
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <NoAccess />
      </Container>
    );
  }

  return (
    <PageTransition>
      {/* At least the height of the window below the header, so the box to
          type in sits at the bottom of the screen from the start. No page
          heading of the usual kind: the workspace is a chat, with its own
          bar (and the page's h1) at the top of its column. */}
      <Container size="wide" className="flex min-h-[calc(100dvh-4rem)] flex-col">
        <ConductorWorkspace />
      </Container>
    </PageTransition>
  );
}
