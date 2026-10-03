import { notFound } from "next/navigation";

import { LAUNCH_SCREENS, launchScreenId } from "@/lib/launch-screens";
import { renderLaunchScreen } from "@/lib/og";

/**
 * /app-launch/<theme>-<width>x<height> - the installed app's iOS launch
 * screens (src/lib/launch-screens.ts), listed in the root layout's metadata.
 * Built once at build time and served as static files.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return LAUNCH_SCREENS.map((screen) => ({ screen: launchScreenId(screen) }));
}

export async function GET(_request: Request, ctx: RouteContext<"/app-launch/[screen]">) {
  const { screen: id } = await ctx.params;
  const screen = LAUNCH_SCREENS.find((candidate) => launchScreenId(candidate) === id);
  if (!screen) notFound();
  const landscape = screen.orientation === "landscape";
  return renderLaunchScreen({
    width: landscape ? screen.height : screen.width,
    height: landscape ? screen.width : screen.height,
    ratio: screen.ratio,
    statusBar: screen.statusBar,
    theme: screen.theme,
  });
}
