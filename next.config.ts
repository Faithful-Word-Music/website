import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The song list PDF is drawn at request time in the site's own typefaces,
   * read from disk - so the font files must ship with that function.
   */
  outputFileTracingIncludes: {
    "/song-list/pdf/[month]": ["./assets/fonts/*.ttf"],
  },

  /**
   * Song pages moved from /song-list/archive/<song> to /library/songs/<song>.
   * Links already shared (and the quarterly emails) keep working. The archive
   * itself stays at /song-list/archive.
   */
  async redirects() {
    return [
      { source: "/song-list/archive/:song", destination: "/library/songs/:song", permanent: true },
      {
        source: "/song-list/archive/:song/sheet-music/:file",
        destination: "/library/songs/:song/sheet-music/:file",
        permanent: true,
      },
    ];
  },
};

/**
 * withBotId adds the rewrites that serve the BotID challenge from this site's
 * own domain. Without them an ad-blocker or privacy extension can drop the
 * challenge script, and every visitor behind one looks like a bot.
 */
export default withBotId(nextConfig);
