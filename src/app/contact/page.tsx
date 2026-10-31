import type { Metadata } from "next";

import { PublicContact } from "@/components/contact/PublicContact";
import { SupportCenter } from "@/components/support/SupportCenter";
import { siteConfig } from "@/config/site";
import { contactContent } from "@/content/contact";
import { getViewer, requestAccountsStatus, type Viewer } from "@/lib/auth/session";
import { usesSupport } from "@/lib/support/access";

export const metadata: Metadata = {
  title: contactContent.title,
  description: contactContent.lead,
  alternates: { canonical: "/contact" },
  openGraph: {
    title: `${contactContent.title} | ${siteConfig.name}`,
    description: contactContent.lead,
    url: `${siteConfig.url}/contact`,
  },
};

/**
 * Contact. Signed out, it is the public contact form, exactly as before.
 * Signed in, it is the Music Ministry Support Center (docs/support-center.md).
 *
 * The page is rendered for each request so it can tell the two apart; the
 * metadata and share card stay the public ones. A signed-out visit reads
 * nothing from the database (getViewer stops at the session). If the
 * session or the database cannot be read, the public form is shown, so
 * there is always a way to get in touch.
 */
export default async function ContactPage({ searchParams }: PageProps<"/contact">) {
  const status = await requestAccountsStatus();
  let viewer: Viewer | null = null;
  if (status.available) {
    try {
      viewer = await getViewer();
    } catch (error) {
      console.error("[support] The session could not be read:", error instanceof Error ? error.message : "unknown error");
    }
  }
  if (!viewer || !usesSupport(viewer)) return <PublicContact />;
  return <SupportCenter viewer={viewer} params={await searchParams} />;
}
