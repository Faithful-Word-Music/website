/**
 * The site's emails to people, in its quiet style (the palette of the
 * quarterly report email, src/lib/quarterly-report-email.ts), each with a
 * plain-text copy. Pure.
 *
 *   renderBrandedEmail       the frame: the name, a card with a heading,
 *                            paragraphs and one button, and a small footer
 *   renderNotificationEmail  a notification as an email (email-delivery.ts)
 *
 * A notification's email says nothing the notification does not: whatever is
 * kept out of a notification (a draft's songs, for one) is kept out of its
 * email too. Everything given is escaped; links only ever lead to the site.
 */

import { siteConfig } from "@/config/site";
import { escapeHtml } from "@/lib/html";

/** Where links point when the site's own address is not known. */
export const DEFAULT_ORIGIN = siteConfig.url;

const LIGHT = { paper: "#faf9f6", surface: "#ffffff", ink: "#111111", inkSoft: "#2a2a28", muted: "#6b6b68", line: "#e5e5e2", gold: "#b08d57" };
const DARK = { paper: "#141412", surface: "#1c1c1a", ink: "#f2f0ea", inkSoft: "#d9d6ce", muted: "#a3a19a", line: "#2e2d2a", gold: "#c9a36b" };
const SERIF = "'Source Serif 4', Georgia, 'Times New Roman', serif";
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** An address on the site, made absolute for an email. Anything that is not a site path is dropped. */
export function absoluteSiteUrl(origin: string, path: string | null): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  return `${origin.replace(/\/+$/, "")}${path}`;
}

export interface BrandedEmail {
  heading: string;
  /** Plain text. A single line break inside one is kept. */
  paragraphs: readonly string[];
  /** The one button, if any: an absolute address already. */
  button?: { url: string; label: string } | null;
  /** The small print under the card, with an optional link after it. */
  footer: { text: string; link?: { url: string; label: string } | null };
}

/** The frame every email from the site is drawn in: the HTML and its plain-text copy. */
export function renderBrandedEmail(input: BrandedEmail): { text: string; html: string } {
  const paragraphs = input.paragraphs.filter((part) => part.trim() !== "");
  const { button, footer } = input;

  const text = [
    input.heading,
    "",
    ...paragraphs.flatMap((part) => [part, ""]),
    ...(button ? [`${button.label}: ${button.url}`, ""] : []),
    "--",
    siteConfig.name,
    footer.text,
    ...(footer.link ? [`${footer.link.label}: ${footer.link.url}`] : []),
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(input.heading)}</title>
<style>
@media (prefers-color-scheme: dark) {
.fw-paper{background:${DARK.paper}!important}
.fw-surface{background:${DARK.surface}!important;border-color:${DARK.line}!important}
.fw-ink{color:${DARK.ink}!important}
.fw-soft{color:${DARK.inkSoft}!important}
.fw-muted,.fw-muted a{color:${DARK.muted}!important}
.fw-gold{color:${DARK.gold}!important}
.fw-button{background:${DARK.ink}!important;color:${DARK.paper}!important}
}
</style>
</head>
<body class="fw-paper" style="margin:0;padding:0;background:${LIGHT.paper}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="fw-paper" style="background:${LIGHT.paper}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td class="fw-gold" style="padding:0 4px 12px;font-family:${SANS};font-size:11px;line-height:16px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${LIGHT.gold}">${escapeHtml(siteConfig.name)}</td></tr>
<tr><td class="fw-surface" style="background:${LIGHT.surface};border:1px solid ${LIGHT.line};border-radius:12px;padding:28px 28px 24px">
<h1 class="fw-ink" style="margin:0 0 14px;font-family:${SERIF};font-size:24px;line-height:30px;font-weight:600;color:${LIGHT.ink}">${escapeHtml(input.heading)}</h1>
${paragraphs
  .map(
    (part) =>
      `<p class="fw-soft" style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:23px;color:${LIGHT.inkSoft}">${escapeHtml(part).replace(/\n/g, "<br>")}</p>`,
  )
  .join("\n")}
${
  button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px"><tr><td class="fw-button" style="background:${LIGHT.ink};border-radius:8px"><a href="${escapeHtml(button.url)}" class="fw-button" style="display:inline-block;padding:11px 20px;font-family:${SANS};font-size:14px;line-height:18px;font-weight:600;color:${LIGHT.paper};text-decoration:none;border-radius:8px">${escapeHtml(button.label)}</a></td></tr></table>`
    : ""
}
</td></tr>
<tr><td class="fw-muted" style="padding:16px 4px 0;font-family:${SANS};font-size:12px;line-height:18px;color:${LIGHT.muted}">${escapeHtml(footer.text)}${
    footer.link
      ? ` <a href="${escapeHtml(footer.link.url)}" style="color:${LIGHT.muted};text-decoration:underline">${escapeHtml(footer.link.label)}</a>.`
      : ""
  }</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { text, html };
}

export function renderNotificationEmail(input: {
  title: string;
  body: string;
  actionUrl: string | null;
  categoryName: string;
  origin: string;
}): RenderedEmail {
  const link = absoluteSiteUrl(input.origin, input.actionUrl);
  const settings = absoluteSiteUrl(input.origin, "/notifications/settings")!;
  // True whether the person switched email on or it was on from the start (a confirmation).
  const why = `You are receiving this because email is on for "${input.categoryName}" notifications.`;
  const { text, html } = renderBrandedEmail({
    heading: input.title,
    paragraphs: input.body.split(/\n{2,}/),
    button: link ? { url: link, label: "Open" } : null,
    footer: { text: why, link: { url: settings, label: "Change what you receive" } },
  });
  return { subject: input.title, text, html };
}
