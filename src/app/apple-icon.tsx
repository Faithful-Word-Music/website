import { renderAppIcon } from "@/lib/og";

/**
 * The iPhone and iPad home screen icon, used when a member adds the site to
 * their Home Screen. iOS rounds the corners itself, so the ink runs edge to
 * edge. Drawn from the one mark, src/app/icon.svg.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return renderAppIcon({ size: size.width, background: "full-bleed" });
}
