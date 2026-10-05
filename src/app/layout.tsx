import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";

import { AccountProvider } from "@/components/account/AccountContext";
import { AppOnly } from "@/components/app/AppOnly";
import { InstalledApp } from "@/components/app/InstalledApp";
import { Splash } from "@/components/app/Splash";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SkipLink } from "@/components/layout/SkipLink";
import { PageHistoryTracker } from "@/components/ui/BackLink";
import { BackToTop } from "@/components/ui/BackToTop";
import { NavigationProgress } from "@/components/ui/NavigationProgress";
import { Toaster } from "@/components/ui/Toaster";
import { siteConfig } from "@/config/site";
import { clerkAppearance, clerkLocalization } from "@/lib/auth/appearance";
import { currentClerkConfig, warnIfMisconfigured } from "@/lib/auth/clerk-env";
import { appOnlyInitScript } from "@/lib/app-only";
import { installPromptCaptureScript } from "@/lib/install";
import { launchScreenLinks } from "@/lib/launch-screens";
import { packetsInitScript } from "@/lib/service-packets";
import { splashInitScript } from "@/lib/splash";
import { canvasStyle, PAPER_DARK, PAPER_LIGHT, themeInitScript } from "@/lib/theme";

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
  // Added to an iPhone or iPad Home Screen, the site opens as its own app
  // under its full name, straight onto a picture of the loading screen
  // (src/lib/launch-screens.ts). The manifest (src/app/manifest.ts) does the
  // same everywhere else.
  appleWebApp: {
    capable: true,
    title: siteConfig.name,
    statusBarStyle: "default",
    startupImage: launchScreenLinks(),
  },
};

/**
 * The browser bar matches the page: paper in light mode, dark paper in dark.
 * colorScheme tells the browser both themes exist before any CSS has loaded,
 * so the empty canvas it shows first is already dark on a dark device.
 */
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: PAPER_LIGHT },
    { media: "(prefers-color-scheme: dark)", color: PAPER_DARK },
  ],
};

/**
 * Member accounts (Clerk). Only switched on when the keys are present AND
 * match this environment (src/lib/auth/clerk-env.ts). Otherwise the site
 * renders exactly as it did before accounts existed.
 */
function AccountsProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  if (!enabled) return children;
  return (
    // Not `dynamic`: the public pages stay static and cached. The session is
    // read in the browser, and on the server only by the account pages.
    <ClerkProvider
      appearance={clerkAppearance}
      localization={clerkLocalization}
      signInUrl="/login"
      signUpUrl="/accept-invite"
      // With no page to go back to (?redirect_url=...): someone logging in
      // lands on their Dashboard; someone who has just created their account
      // from an invitation is new, so they start by setting up their profile.
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/profile/edit?welcome=1"
      afterSignOutUrl="/"
    >
      <AccountProvider>
        {/* The installed app: members only (src/lib/app-only.ts). */}
        <AppOnly />
        {children}
      </AccountProvider>
    </ClerkProvider>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  const clerkConfig = currentClerkConfig();
  warnIfMisconfigured(clerkConfig);
  const authEnabled = clerkConfig.status === "ready";

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
        {/* The page's paper colour, before the stylesheet: nothing lighter (or
            darker) ever shows first. See canvasStyle in src/lib/theme.ts. */}
        <style dangerouslySetInnerHTML={{ __html: canvasStyle }} />
        {/* Applies a saved light/dark choice before the first paint, so the
            page never flashes the other theme. See src/lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* Keeps the browser's "install this app" event for signed-in
            members' Install button, and stops Chrome offering it to everyone
            on its own. See src/lib/install.ts. */}
        <script dangerouslySetInnerHTML={{ __html: installPromptCaptureScript }} />
        {/* Puts up the loading screen for a signed-in member's first load in
            this tab or app launch. See src/lib/splash.ts. */}
        <script dangerouslySetInnerHTML={{ __html: splashInitScript }} />
        {/* Holds open the song list's sheet music buttons for a member this
            browser has seen, so they do not push the cards about as they
            arrive. See src/lib/service-packets.ts. */}
        <script dangerouslySetInnerHTML={{ __html: packetsInitScript }} />
        {/* The installed app is members-only: signed out, it goes straight
            to log in. See src/lib/app-only.ts. */}
        {authEnabled ? <script dangerouslySetInnerHTML={{ __html: appOnlyInitScript }} /> : null}
      </head>
      <body className="flex min-h-full flex-col bg-paper">
        {/* Scroll-reveal content starts hidden and is revealed by JavaScript.
            Without JavaScript there is nothing to reveal it, so show it up front. */}
        <noscript>
          <style>{".reveal{opacity:1;transform:none}"}</style>
        </noscript>

        {/* The loading screen: hidden unless the script above put it up. */}
        <Splash />

        {/* A thin bar across the top while the next page loads. */}
        <NavigationProgress />
        {/* "Saved." for anything whose own button is gone by then (toast.ts). */}
        <Toaster />
        <PageHistoryTracker />
        <SkipLink />
        <AccountsProvider enabled={authEnabled}>
          <Header authEnabled={authEnabled} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
        </AccountsProvider>
        {/* Site-wide: appears on any page once it has been scrolled more
            than a screen, so short pages never show it. */}
        <BackToTop />
        {/* Only inside the installed app on a phone or tablet: a PDF viewer
            with Close and Save or share, and pull-to-refresh. */}
        <InstalledApp />
      </body>
    </html>
  );
}
