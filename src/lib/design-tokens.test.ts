import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "./contrast";

/**
 * The colour tokens in globals.css, read from the file itself, so the
 * contrast guarantees in its header comment cannot drift from the values.
 */

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

/** The text of the first `{ ... }` block after `marker` (searching from `from`); token blocks hold no nested braces. */
function blockAfter(marker: string, from = 0): string {
  const at = css.indexOf(marker, from);
  if (at < 0) throw new Error(`Missing block: ${marker}`);
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function colours(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{3,6})\s*;/gi)) out[match[1]] = match[2].toLowerCase();
  return out;
}

const light = colours(blockAfter("@theme {"));
const explicitDark = colours(blockAfter(':root[data-theme="dark"] {'));
const systemDark = colours(blockAfter(':root:not([data-theme="light"]) {'));
const print = colours(blockAfter(':root:not([data-theme="light"]) {', css.indexOf("@media print")));

const STATUSES = ["success", "warning", "danger", "info"] as const;
const AA = 4.5;

describe("design tokens", () => {
  it("defines every status token, foreground and fill, in each theme", () => {
    for (const theme of [light, explicitDark, systemDark, print]) {
      for (const status of STATUSES) {
        expect(theme[status]).toMatch(/^#/);
        expect(theme[`${status}-bg`]).toMatch(/^#/);
      }
    }
  });

  it("keeps the device's dark mode identical to the chosen dark mode", () => {
    expect(systemDark).toEqual(explicitDark);
  });

  it("prints in the light colours", () => {
    for (const [name, value] of Object.entries(print)) expect(value, name).toBe(light[name]);
  });

  it("defines the control radius", () => {
    expect(css).toMatch(/--radius-control:\s*0\.5rem;/);
  });

  for (const [label, theme] of [
    ["light", light],
    ["dark", explicitDark],
  ] as const) {
    describe(`${label} theme`, () => {
      for (const status of STATUSES) {
        it(`${status} text meets AA on its fill, on surface and on paper`, () => {
          const fg = theme[status];
          // Tokens a theme does not redefine fall back to the light ones.
          const surface = theme.surface ?? light.surface;
          const paper = theme.paper ?? light.paper;
          expect(contrastRatio(fg, theme[`${status}-bg`])).toBeGreaterThanOrEqual(AA);
          expect(contrastRatio(fg, surface)).toBeGreaterThanOrEqual(AA);
          expect(contrastRatio(fg, paper)).toBeGreaterThanOrEqual(AA);
        });
      }

      it("keeps ink and muted text readable on paper and surface", () => {
        for (const bg of [theme.paper, theme.surface]) {
          expect(contrastRatio(theme.ink, bg)).toBeGreaterThanOrEqual(AA);
          expect(contrastRatio(theme.muted, bg)).toBeGreaterThanOrEqual(AA);
        }
      });
    });
  }
});

describe("contrastRatio", () => {
  it("matches WCAG's extremes and is symmetric", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
    expect(contrastRatio("#6b6b68", "#faf9f6")).toBeCloseTo(contrastRatio("#faf9f6", "#6b6b68"), 10);
  });

  it("rejects something that is not a hex colour", () => {
    expect(() => contrastRatio("red", "#fff")).toThrow();
  });
});
