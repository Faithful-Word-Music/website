"use client";

import type { ReactNode } from "react";

/**
 * A link to a section on this page ("#sheet-music-gaps") that scrolls there
 * on EVERY click, and leaves the address alone. A plain hash link only
 * scrolls when the address changes - so once the hash was in the address,
 * clicking again did nothing - and the hash itself served no purpose. The
 * href stays for the browser's link preview and for visitors without
 * JavaScript, where it works as an ordinary jump.
 *
 * Scrolling follows the site's CSS (smooth, or instant with reduced motion),
 * and the section's scroll-margin keeps it clear of the sticky header.
 */
export function InPageLink({
  href,
  className,
  children,
}: {
  href: `#${string}`;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        const target = document.getElementById(href.slice(1));
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ block: "start" });
      }}
    >
      {children}
    </a>
  );
}
