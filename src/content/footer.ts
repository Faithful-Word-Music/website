import { siteConfig } from "@/config/site";

/**
 * Editable copy and links for the site footer.
 *
 * External resource URLs live in src/config/site.ts (siteConfig.resources) so
 * they are defined once; this file controls their labels, order and grouping.
 * To add or remove a footer resource, edit the `resources` array below.
 */
export const footerContent = {
  /** Short identification under the brand. */
  blurb: `The music ministry of ${siteConfig.church.name} in ${siteConfig.church.location}.`,

  navHeading: "Navigation",

  resourcesHeading: "Resources",
  resources: [
    { label: "Faithful Word Baptist Church", href: siteConfig.resources.church },
    { label: "Faithful Word Music on YouTube", href: siteConfig.resources.youtube },
    { label: "Faithful Word Music on MuseScore", href: siteConfig.resources.musescore },
    { label: "Hymn CDs", href: siteConfig.resources.hymnCds },
  ],

  contactHeading: "Contact",
  contactBlurb: "For questions about the music ministry:",

  /** Bottom-right of the footer. Only `login` / `account` are links. */
  account: {
    prompt: "Have an account?",
    login: "Log in!",
    signedIn: "Signed in ·",
    account: "Your account",
  },

  /** {year} is replaced with the current year at render time. */
  copyright: `{year} ${siteConfig.name}`,
} as const;
