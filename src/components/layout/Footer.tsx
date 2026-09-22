import Link from "next/link";

import { Logo } from "@/components/layout/Logo";
import { Container } from "@/components/ui/Container";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { Reveal } from "@/components/ui/Reveal";
import { siteConfig } from "@/config/site";
import { footerContent } from "@/content/footer";

/**
 * Site footer. External resources live here rather than on a dedicated page -
 * there are not enough of them yet to justify one.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    // Anchored like the header, so it stays put during a page transition.
    <footer
      style={{ viewTransitionName: "site-footer" }}
      className="mt-24 border-t border-line bg-surface"
    >
      <Container size="wide" className="py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Identification */}
          <Reveal className="lg:pr-6">
            <p className="flex items-center gap-2.5 font-display text-lg text-ink">
              <Logo size={28} className="shrink-0" />
              {siteConfig.name}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {footerContent.blurb}
            </p>
          </Reveal>

          {/* Navigation */}
          <Reveal delay={70}>
            <nav aria-label="Footer">
              <h2 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark">
                {footerContent.navHeading}
              </h2>
              <ul className="mt-4 space-y-1">
                {siteConfig.nav.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="inline-flex min-h-9 items-center text-sm text-muted transition-colors hover:text-ink"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </Reveal>

          {/* Resources */}
          <Reveal delay={140}>
            <h2 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark">
              {footerContent.resourcesHeading}
            </h2>
            <ul className="mt-4 space-y-1">
              {footerContent.resources.map((resource) => (
                <li key={resource.href}>
                  <ExternalLink
                    href={resource.href}
                    showIcon
                    className="inline-flex min-h-9 items-center text-sm text-muted hover:text-ink"
                  >
                    {resource.label}
                  </ExternalLink>
                </li>
              ))}
            </ul>
          </Reveal>

          {/* Contact */}
          <Reveal delay={210}>
            <h2 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark">
              {footerContent.contactHeading}
            </h2>
            <p className="mt-4 text-sm text-muted">
              {footerContent.contactBlurb}
            </p>
            <a
              href={`mailto:${siteConfig.contactEmail}`}
              className="mt-1 inline-flex min-h-9 items-center text-sm text-ink underline decoration-gold underline-offset-4 transition-colors hover:text-gold-dark"
            >
              {siteConfig.contactEmail}
            </a>
          </Reveal>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            {footerContent.copyright.replace("{year}", String(year))}
          </p>

          {/* Set in the same small tracked label the footer headings use. The
              text stays normal-case here and is uppercased in CSS, so it reads
              naturally to a screen reader and is easy to edit. */}
          <p className="font-sans text-[0.7rem] uppercase tracking-[0.18em] text-muted">
            {footerContent.builtBy.prefix}{" "}
            <ExternalLink
              href={footerContent.builtBy.href}
              className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-dark"
            >
              {footerContent.builtBy.name}
            </ExternalLink>
          </p>
        </div>
      </Container>
    </footer>
  );
}
