/**
 * The installed app's launch screens on iPhone and iPad - what iOS shows the
 * instant the app is opened, before the page has painted anything. Each is a
 * picture of the loading screen (src/components/app/Splash.tsx): the mark and
 * the name on paper, in light and dark, so the app opens straight onto the
 * loading screen with no blank screen first and no jump when the page takes
 * over. Android draws its own from the manifest's colours and icon.
 *
 * iOS only uses a launch screen whose size matches the device exactly, so
 * there is one per screen size, portrait - and landscape for iPads, which
 * open either way. The pictures are drawn by src/app/app-launch/[screen].
 *
 * `statusBar` is the height of the status bar above the page (the app uses
 * the "default" style, so the page starts below it): the loading screen is
 * centred in the page, so the picture is centred in what is left.
 *
 * A new iPhone or iPad size: add a line. Until then that device shows a plain
 * screen in the background colour, as before.
 */

export interface LaunchScreen {
  /** CSS pixels, portrait. */
  width: number;
  height: number;
  /** Device pixels per CSS pixel. */
  ratio: 2 | 3;
  statusBar: number;
  orientation: "portrait" | "landscape";
  theme: "light" | "dark";
}

const IPHONES: Array<Omit<LaunchScreen, "orientation" | "theme">> = [
  { width: 440, height: 956, ratio: 3, statusBar: 62 }, // 16/17 Pro Max
  { width: 402, height: 874, ratio: 3, statusBar: 62 }, // 16/17 Pro
  { width: 430, height: 932, ratio: 3, statusBar: 59 }, // 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  { width: 393, height: 852, ratio: 3, statusBar: 59 }, // 14 Pro, 15, 15 Pro, 16
  { width: 428, height: 926, ratio: 3, statusBar: 47 }, // 12/13 Pro Max, 14 Plus
  { width: 390, height: 844, ratio: 3, statusBar: 47 }, // 12, 13, 14
  { width: 414, height: 896, ratio: 3, statusBar: 44 }, // XS Max, 11 Pro Max
  { width: 414, height: 896, ratio: 2, statusBar: 48 }, // XR, 11
  { width: 375, height: 812, ratio: 3, statusBar: 44 }, // X, XS, 11 Pro, 12/13 mini
  { width: 414, height: 736, ratio: 3, statusBar: 20 }, // 8 Plus
  { width: 375, height: 667, ratio: 2, statusBar: 20 }, // 8, SE (2nd, 3rd)
  { width: 320, height: 568, ratio: 2, statusBar: 20 }, // SE (1st)
];

const IPADS: Array<Omit<LaunchScreen, "orientation" | "theme">> = [
  { width: 1032, height: 1376, ratio: 2, statusBar: 24 }, // Pro 13" (M4), Air 13"
  { width: 1024, height: 1366, ratio: 2, statusBar: 24 }, // Pro 12.9"
  { width: 834, height: 1210, ratio: 2, statusBar: 24 }, // Pro 11" (M4), Air 11" (M2)
  { width: 834, height: 1194, ratio: 2, statusBar: 24 }, // Pro 11"
  { width: 820, height: 1180, ratio: 2, statusBar: 24 }, // Air 10.9", iPad 10th
  { width: 810, height: 1080, ratio: 2, statusBar: 20 }, // iPad 10.2"
  { width: 744, height: 1133, ratio: 2, statusBar: 24 }, // mini 6th
  { width: 768, height: 1024, ratio: 2, statusBar: 20 }, // mini 5th, iPad 9.7"
];

export const LAUNCH_SCREENS: LaunchScreen[] = (["light", "dark"] as const).flatMap((theme) => [
  ...IPHONES.map((device) => ({ ...device, orientation: "portrait" as const, theme })),
  ...IPADS.flatMap((device) =>
    (["portrait", "landscape"] as const).map((orientation) => ({ ...device, orientation, theme })),
  ),
]);

/** Its address segment, e.g. "dark-1320x2868": the theme and the picture's size in device pixels. */
export function launchScreenId(screen: LaunchScreen): string {
  const [w, h] = screen.orientation === "portrait" ? [screen.width, screen.height] : [screen.height, screen.width];
  return `${screen.theme}-${w * screen.ratio}x${h * screen.ratio}`;
}

/** For metadata.appleWebApp.startupImage: each picture, and the device it is for. */
export function launchScreenLinks(): Array<{ url: string; media: string }> {
  return LAUNCH_SCREENS.map((screen) => ({
    url: `/app-launch/${launchScreenId(screen)}`,
    media: [
      `(device-width: ${screen.width}px)`,
      `(device-height: ${screen.height}px)`,
      `(-webkit-device-pixel-ratio: ${screen.ratio})`,
      `(orientation: ${screen.orientation})`,
      `(prefers-color-scheme: ${screen.theme})`,
    ].join(" and "),
  }));
}
