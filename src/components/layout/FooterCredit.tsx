import { ExternalLink } from "@/components/ui/ExternalLink";
import { footerContent } from "@/content/footer";

/**
 * The closing line's two parts, the same wherever they appear: the site
 * footer, the compact app footer, and the account menu inside the installed
 * app (which has no footer).
 */

/** "2026 Faithful Word Music". */
export function copyrightLine(): string {
  return footerContent.copyright.replace("{year}", String(new Date().getFullYear()));
}

/** "Developed by Alexander D. Ball" - only the name is a link. */
export function DeveloperCredit() {
  return (
    <>
      {footerContent.developer.prompt}{" "}
      <ExternalLink
        href={footerContent.developer.href}
        className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-dark"
      >
        {footerContent.developer.name}
      </ExternalLink>
    </>
  );
}
