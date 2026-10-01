/**
 * Makes Clerk's sign-in, sign-up and profile screens look like the rest of
 * the site. The colours are the site's own CSS variables (src/app/globals.css),
 * so they follow the light/dark theme without any extra work.
 *
 * Like the site's buttons, gold is never used as a text or fill colour: it
 * fails contrast on paper. Primary actions are ink, as elsewhere; gold is the
 * hover and focus accent.
 *
 * Field and button edges (the rings round inputs and outline buttons) are
 * drawn in globals.css instead: Clerk's own, more specific rules win over
 * anything set here, and drew them too faintly to see on the dark theme.
 */

const field = {
  borderRadius: "0.5rem",
  backgroundColor: "var(--color-surface)",
  color: "var(--color-ink)",
};

const outlineButton = {
  borderRadius: "999px",
  minHeight: "2.75rem",
  backgroundColor: "var(--color-surface)",
  color: "var(--color-ink)",
  "&:hover": { backgroundColor: "var(--color-surface)" },
};

const variables = {
  colorPrimary: "var(--color-ink)",
  colorPrimaryForeground: "var(--color-paper)",
  colorForeground: "var(--color-ink)",
  colorMutedForeground: "var(--color-muted)",
  colorMuted: "var(--color-paper)",
  colorBackground: "var(--color-surface)",
  colorInput: "var(--color-surface)",
  colorInputForeground: "var(--color-ink)",
  colorBorder: "var(--color-staff)",
  colorRing: "var(--color-gold)",
  colorNeutral: "var(--color-ink)",
  colorDanger: "#c2410c",
  fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  borderRadius: "0.75rem",
};

/** Shared by every Clerk screen: fields, buttons, links and headings in the site's style. */
const sharedElements = {
  formFieldLabel: { color: "var(--color-ink)", fontWeight: 500 },
  formFieldInput: { ...field, minHeight: "2.75rem", paddingInline: "0.875rem" },
  formFieldInputShowPasswordButton: { color: "var(--color-muted)", "&:hover": { color: "var(--color-ink)" } },
  otpCodeFieldInput: { ...field, borderRadius: "0.5rem" },
  formButtonPrimary: {
    borderRadius: "999px",
    minHeight: "2.75rem",
    fontWeight: 500,
    textTransform: "none",
    "&:hover": { backgroundColor: "var(--color-ink-soft)" },
  },
  socialButtonsBlockButton: outlineButton,
  socialButtonsBlockButtonText: { color: "var(--color-ink)", fontWeight: 500 },
  alternativeMethodsBlockButton: outlineButton,
  identityPreview: { borderRadius: "999px" },
  identityPreviewText: { color: "var(--color-ink)" },
  identityPreviewEditButton: { color: "var(--color-ink)" },
  dividerLine: { backgroundColor: "var(--color-line)" },
  dividerText: { color: "var(--color-muted)" },
  headerTitle: {
    fontFamily: "var(--font-source-serif), Georgia, serif",
    fontWeight: 400,
    fontSize: "1.5rem",
    color: "var(--color-ink)",
  },
  headerSubtitle: { color: "var(--color-muted)" },
  formResendCodeLink: { color: "var(--color-ink)", textDecoration: "underline", textUnderlineOffset: "4px" },
  backLink: { color: "var(--color-ink)" },
  formFieldAction: { color: "var(--color-ink)" },
  footerActionLink: { color: "var(--color-ink)" },
} as const;

export const clerkAppearance = {
  variables,
  elements: {
    ...sharedElements,
    // The page around the form supplies the card, so Clerk's own frame goes,
    // and the form fills the card's width.
    rootBox: { width: "100%" },
    cardBox: { boxShadow: "none", border: "none", width: "100%", maxWidth: "100%", borderRadius: "0" },
    card: { boxShadow: "none", border: "none", background: "transparent", padding: "0", width: "100%" },
    footer: { background: "transparent", paddingInline: "0" },
    // Clerk's "Don't have an account? Sign up" - accounts are invite-only, and
    // the login page has its own "Request one!" link instead. (Clerk's heading
    // is hidden on the first step only - see globals.css - so later steps
    // such as "Check your email" still explain themselves.)
    footerAction: { display: "none" },
  },
} as const;

/** The profile screen keeps its own navigation and frame; only the style is shared. */
export const clerkProfileAppearance = {
  variables,
  elements: {
    ...sharedElements,
    rootBox: { width: "100%" },
    cardBox: { boxShadow: "none", border: "1px solid var(--color-line)", width: "100%", maxWidth: "100%" },
  },
} as const;

/**
 * Clerk's account screen (/account) calls its first tab "Profile". On this
 * site Profile means the person in the ministry (/profile); Clerk's screen is
 * about signing in. Only these labels change - everything else is Clerk's own
 * English wording.
 */
export const clerkLocalization = {
  userProfile: {
    navbar: { title: "Account", description: "How you sign in.", account: "Sign-in" },
    start: {
      headerTitle__account: "Sign-in details",
      profileSection: { title: "Name and photo" },
    },
  },
};
