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
    { label: "FWBC Music on YouTube", href: siteConfig.resources.youtube },
    { label: "FWBC Music on MuseScore", href: siteConfig.resources.musescore },
    { label: "Congregation Song Sheets", href: siteConfig.resources.songSheets },
    { label: "Hymn CDs", href: siteConfig.resources.hymnCds },
  ],

  contactHeading: "Contact",
  contactBlurb: "For questions about the music ministry:",

  /** {year} is replaced with the current year at render time. */
  copyright: `{year} ${siteConfig.name}`,
} as const;
