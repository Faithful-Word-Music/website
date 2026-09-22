/**
 * Editable copy for the home page (/).
 * Change wording here rather than inside the components.
 */
export const homeContent = {
  hero: {
    eyebrow: "Phoenix, Arizona",
    title: "Faithful Word Music",
    subtitle: "The Music Ministry of Faithful Word Baptist Church",
    lead: "Sacred, conservative church music for the congregation - song schedules, recordings and sheet music, kept freely available to our church and to like-minded believers anywhere.",
    primaryCta: { label: "View Song List", href: "/song-list" },
    secondaryCta: { label: "Contact Us", href: "/contact" },
  },

  purpose: {
    eyebrow: "About",
    title: "Music that serves the congregation",
    paragraphs: [
      "Faithful Word Music is the music ministry of Faithful Word Baptist Church, an independent, fundamental Baptist church in Phoenix, Arizona. Our work centres on the singing of the whole congregation - choosing it carefully, preparing it well, and making it easy to learn.",
      "We sing conservative, sacred music: traditional hymns from Soul-Stirring Songs and Hymns, the Psalms, and other trusted sources. We do not sing, nor do we support singing, Contemporary Christian Music. We would rather the music of the church stay set apart than conform to the style of this world.",
      "These resources are prepared first for our own congregation, but they are published openly. If they serve like-minded believers elsewhere, we are glad for them to be used.",
    ],
  },

  songList: {
    eyebrow: "Congregational Song List",
    title: "Know what we are singing before you arrive",
    body: "Browse the songs scheduled for congregational singing at Faithful Word Baptist Church, with hymnal numbers and keys for every service. The list comes straight from our song schedule, so it stays current.",
    cta: { label: "View Song List", href: "/song-list" },
  },

  contact: {
    eyebrow: "Contact",
    title: "Questions about the music ministry?",
    body: "Whether you attend Faithful Word Baptist Church or found these resources from somewhere else, we would be glad to hear from you.",
    cta: { label: "Contact Us", href: "/contact" },
  },
} as const;
