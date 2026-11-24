import type { Metadata } from "next";

import { FavoritesSection } from "@/components/library/FavoritesSection";
import { LibrarySectionNav } from "@/components/library/LibrarySectionNav";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";
import { favoritesContent } from "@/content/favorites";
import { libraryContent } from "@/content/library";
import { requireViewer } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: favoritesContent.metaTitle,
  description: favoritesContent.metaDescription,
  robots: { index: false, follow: false },
};

/**
 * The member's Favorites, inside the Library. The session and profile are
 * checked here on the server, whatever the navigation or proxy did. The list
 * itself is fetched privately by the browser, so it is never in this HTML.
 */
export default async function FavoritesPage() {
  await requireViewer("/library/favorites");

  return (
    <PageTransition>
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <SectionHeading as="h1" eyebrow={siteConfig.name} title={libraryContent.title} className="max-w-2xl">
          <p className="text-base sm:text-lg">{favoritesContent.lead}</p>
        </SectionHeading>
        <LibrarySectionNav className="mt-8" />
        <section aria-label={favoritesContent.title} className="mt-8">
          <FavoritesSection />
        </section>
      </Container>
    </PageTransition>
  );
}
