
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
      // In the installed app's login screen, only the closing line stays.
      className="mt-24 border-t border-line bg-surface app-login:mt-0 app-login:border-t-0 app-login:bg-transparent"
    >
      <Container size="wide" className="py-14 app-login:py-4">
        {/* Who this is (the brand, then how to reach it) beside the two lists
            of links. Short blocks pair with short and long with long, so no
            row is left with a hole in it:

              phones       one column: brand, contact, navigation, resources
              to 1023px    brand | contact, then navigation | resources
              from 1024px  brand over contact | navigation | resources */}
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1.5fr] app-login:hidden">
          <div className="grid grid-cols-1 gap-10 sm:col-span-2 sm:grid-cols-2 lg:col-span-1 lg:grid-cols-1">
            {/* Identification */}
            <Reveal>
              <p className="flex items-center gap-2.5 font-display text-lg text-ink">
                <Logo size={28} className="shrink-0" />
                {siteConfig.name}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {footerContent.blurb}
              </p>
            </Reveal>

            {/* Contact */}
            <Reveal delay={70}>
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

          {/* Navigation */}
          <Reveal delay={140}>
            <nav aria-label="Footer">
              <h2 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark">
                {footerContent.navHeading}
              </h2>
              <FooterNav />
            </nav>
          </Reveal>

          {/* Resources */}
          <Reveal delay={210}>
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
        </div>

        {/* The closing line. The bottom right corner of the window belongs to
            the floating buttons ("Back to top", and Conductor's beneath it),
            so nothing is laid out there until the page's own gutter is wide
            enough to clear them:

              phones       copyright, then the developer credit, stacked
              to 1439px    the two on one line from the left, a dot between
                           them - the corner stays empty
              from 1440px  copyright left, credit right

            The footer is the same height whichever buttons are showing. The
            installed app's login screen keeps both lines, centred. */}
        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-6 text-xs text-muted sm:flex-row sm:items-center min-[1440px]:justify-between app-login:mt-0 app-login:flex-col app-login:items-center app-login:gap-1 app-login:border-t-0 app-login:pt-0 app-login:text-center">
          <p>{footerContent.copyright.replace("{year}", String(year))}</p>
          {/* Bounded on both sides: a later `min-[1440px]:hidden` would lose
              to `sm:inline`, which Tailwind emits after arbitrary widths. */}
          <span aria-hidden="true" className="hidden text-staff sm:max-[1440px]:inline app-login:hidden">
            ·
          </span>
          <p>
            {footerContent.developer.prompt}{" "}
            <ExternalLink
              href={footerContent.developer.href}
              className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-dark"
            >
              {footerContent.developer.name}
            </ExternalLink>
          </p>
        </div>
      </Container>
    </footer>
  );
}
