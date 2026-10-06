import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The song list PDF is drawn at request time in the site's own typefaces,
   * read from disk - so the font files must ship with that function.
   */
  outputFileTracingIncludes: {
    "/song-list/pdf/[month]": ["./assets/fonts/*.ttf"],
    // The Service Planner's PDF export draws the same song list.
    "/service-planner/export": ["./assets/fonts/*.ttf"],
    // The planning philosophy lives in the database, but an environment's FIRST version is copied
    // from this document (src/lib/ai/planning/load.ts), by whichever route asks for the philosophy
    // first - so every route that can ask ships with it. A new one is listed here too.
    "/api/conductor": ["./src/content/music-planning-philosophy.md"],
    "/api/conductor/actions/[id]": ["./src/content/music-planning-philosophy.md"],
    "/api/service-planner/ai": ["./src/content/music-planning-philosophy.md"],
    "/admin/ai/philosophy": ["./src/content/music-planning-philosophy.md"],
  },

  /**
   * The service worker (public/sw.js: push notifications only). Never cached,
   * so a new version is picked up at once; and allowed to load nothing but
   * itself.
   */
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },

  /**
   * Song pages moved from /song-list/archive/<song> to /library/songs/<song>.
   * Links already shared (and the quarterly emails) keep working. The archive
   * itself stays at /song-list/archive, and /song-list/archive/services (the
   * service-plan archive) is its own page, never a song.
   */
  async redirects() {
    return [
      {
        source: "/song-list/archive/:song((?!services$)[^/]+)",
        destination: "/library/songs/:song",
        permanent: true,
      },
      {
        source: "/song-list/archive/:song/sheet-music/:file",
        destination: "/library/songs/:song/sheet-music/:file",
        permanent: true,
      },
      // The profile moved from /account to /profile; /account is now account
      // settings (sign-in email, password, devices), which used to be
      // /account/security.
      { source: "/account/edit", destination: "/profile/edit", permanent: true },
      { source: "/account/security", destination: "/account", permanent: true },
      { source: "/account/security/:path*", destination: "/account/:path*", permanent: true },
    ];
  },
};

/**
 * withBotId adds the rewrites that serve the BotID challenge from this site's
 * own domain. Without them an ad-blocker or privacy extension can drop the
 * challenge script, and every visitor behind one looks like a bot.
 */
export default withBotId(nextConfig);
