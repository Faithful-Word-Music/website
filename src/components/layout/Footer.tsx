
import { FooterAccountLink } from "@/components/account/FooterAccountLink";
import { FooterNav } from "@/components/layout/FooterNav";
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
      // In the installed app's login screen, only the copyright line stays.
      className="mt-24 border-t border-line bg-surface app-login:mt-0 app-login:border-t-0 app-login:bg-transparent"
    >
      {/* Extra bottom padding from tablet width until the page gutter is wide
          enough: otherwise the fixed "Back to top" button (48px, 32px from
          the corner) sits on top of the right-hand "Log in!" link when the
          page is scrolled to the end. On phones the row stacks to the left,
          clear of the button; from 1440px the gutter itself clears it. */}
      <Container size="wide" className="py-14 sm:max-[1439px]:pb-24 app-login:py-4">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 app-login:hidden">
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
              <FooterNav />
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

        {/* Copyright on the left, the account link on the right; stacked on
            phones, where the two would not fit side by side comfortably. */}
        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6 app-login:mt-0 app-login:items-center app-login:justify-center app-login:border-t-0 app-login:pt-0">
          <p className="text-xs text-muted app-login:text-center">
            {footerContent.copyright.replace("{year}", String(year))}
          </p>
          <div className="app-login:hidden">
            <FooterAccountLink />
          </div>
        </div>
      </Container>
    </footer>
  );
}
