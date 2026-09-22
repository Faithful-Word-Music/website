import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

/**
 * withBotId adds the rewrites that serve the BotID challenge from this site's
 * own domain. Without them an ad-blocker or privacy extension can drop the
 * challenge script, and every visitor behind one looks like a bot.
 */
export default withBotId(nextConfig);
