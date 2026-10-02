import { notFound } from "next/navigation";

import { renderAppIcon } from "@/lib/og";

/**
 * /app-icon/<variant> - the installed app's icons, listed in
 * src/app/manifest.ts. Drawn from the one mark (src/app/icon.svg), so they
 * follow the logo automatically. Built once at build time and served as
 * static files.
 */
const VARIANTS = {
  "192": { size: 192, background: "any" },
  "512": { size: 512, background: "any" },
  // Android crops this to its own shape (circle, squircle...); the mark stays
  // inside the safe zone.
  maskable: { size: 512, background: "full-bleed", markScale: 0.72 },
} as const;

type Variant = keyof typeof VARIANTS;

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }));
}

export async function GET(_request: Request, ctx: RouteContext<"/app-icon/[variant]">) {
  const { variant } = await ctx.params;
  if (!Object.hasOwn(VARIANTS, variant)) notFound();
  return renderAppIcon(VARIANTS[variant as Variant]);
}
