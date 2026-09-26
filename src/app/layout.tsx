import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SkipLink } from "@/components/layout/SkipLink";
import { BackToTop } from "@/components/ui/BackToTop";
import { NavigationProgress } from "@/components/ui/NavigationProgress";
import { siteConfig } from "@/config/site";
import { themeInitScript } from "@/lib/theme";

import "./globals.css";

/**
 * Two variable families, self-hosted by Next.js at build time: no external
 * font request at runtime, and no layout shift.
 *   Source Serif 4 - display/headings, an editorial serif with engraving feel
 *   Inter          - body and UI, with tabular figures for hymn numbers
 */
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} | ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: `${siteConfig.name} | ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: siteConfig.url,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} | ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

/** The browser bar matches the page: paper in light mode, dark paper in dark. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#141412" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-scroll-behavior="smooth": globals.css makes scrolling smooth, which
    // is right for "Back to top" and in-page links but wrong between pages.
    // This tells Next.js to switch it off while changing page, so a navigation
    // lands instantly at the true top. Without it the smoothed jump is still
    // under way when Next.js checks its position, and it settles below the
    // header instead.
    <html
      lang="en"
      data-scroll-behavior="smooth"
      // The theme script below may add data-theme before React hydrates.
      suppressHydrationWarning
      className={`${sourceSerif.variable} ${inter.variable} h-full antialiased`}
    >
      <head>
        {/* Applies a saved light/dark choice before the first paint, so the
            page never flashes the other theme. See src/lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-paper">
        {/* Scroll-reveal content starts hidden and is revealed by JavaScript.
            Without JavaScript there is nothing to reveal it, so show it up front. */}
        <noscript>
          <style>{".reveal{opacity:1;transform:none}"}</style>
        </noscript>

        {/* A thin bar across the top while the next page loads. */}
        <NavigationProgress />
        <SkipLink />
        <Header />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
        {/* Site-wide: appears on any page once it has been scrolled more
            than a screen, so short pages never show it. */}
        <BackToTop />
      </body>
    </html>
  );
}
