import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Source checks for what keeps the public Library public and the private part private. */

const root = join(process.cwd(), "src");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const SESSION_READS = /getViewer|requireViewer|\bauth\(\)|cookies\(\)|headers\(\)|currentUser/;

describe("the public Library", () => {
  it.each(["app/library/layout.tsx", "app/library/page.tsx", "app/library/songs/[song]/page.tsx"])("%s reads no session on the server", (path) => {
    expect(read(path)).not.toMatch(SESSION_READS);
  });

  it("keeps its hourly revalidation", () => {
    expect(read("app/library/page.tsx")).toMatch(/export const revalidate = 3600/);
    expect(read("app/library/songs/[song]/page.tsx")).toMatch(/export const revalidate = 3600/);
  });

  it("fetches nothing private in the shared layout", () => {
    const layout = read("app/library/layout.tsx");
    expect(layout).not.toMatch(/fetch\(|personal-library|favorites-api/);
  });

  it("has no standalone or future sections", () => {
    for (const path of ["app/my-library", "app/library/notes", "app/library/recent", "app/library/sheet-music"]) {
      expect(existsSync(join(root, path)), path).toBe(false);
    }
    expect(readdirSync(join(root, "app/library"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort())
      .toEqual(["favorites", "songs"]);
  });
});

describe("the private Favorites page", () => {
  const page = read("app/library/favorites/page.tsx");

  it("checks the session and profile itself, and is not indexed", () => {
    expect(page).toMatch(/await requireViewer\("\/library\/favorites"\)/);
    expect(page).not.toMatch(/profileGate: false/);
    expect(page).toMatch(/robots: \{ index: false, follow: false \}/);
    expect(read("app/robots.ts")).toContain(`"/library/favorites"`);
  });

  it("puts no Favorites in its server-rendered HTML", () => {
    expect(page).not.toMatch(/personal-library|listFavorite|favorites-api/);
  });

  it("is in the proxy's matcher, without the rest of the Library", () => {
    const proxy = read("proxy.ts");
    expect(proxy).toContain(`"/library/favorites/:path*"`);
    expect(proxy).not.toMatch(/"\/library"|"\/library\/:path\*"|"\/library\/songs\/:path\*"/);
  });
});

describe("the Dashboard shortcut", () => {
  const dashboard = read("app/dashboard/page.tsx");

  it("is one static link, with no Favorites data", () => {
    expect(dashboard.match(/href="\/library\/favorites"/g)).toHaveLength(1);
    expect(dashboard).not.toMatch(/personal-library|listFavorite|favoriteMembership|favorites-api/);
  });
});

describe("the service worker", () => {
  it("caches nothing, so no private response can persist", () => {
    const worker = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
    expect(worker).not.toMatch(/addEventListener\(\s*["']fetch["']/);
    expect(worker).not.toMatch(/\bcaches\./);
  });
});

describe("browser storage", () => {
  it.each(["favorites-controller.ts", "FavoritesProvider.tsx", "FavoriteButton.tsx", "FavoritesSection.tsx", "LibrarySectionNav.tsx"])("%s keeps nothing durable", (file) => {
    expect(read(`components/library/${file}`)).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  });
});

describe("where hearts appear", () => {
  it("is limited to the Library", () => {
    const users: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && /<FavoriteButton\b/.test(read(path))) users.push(path);
      }
    };
    walk("app");
    walk("components");
    expect(users.sort()).toEqual([
      "app/library/songs/[song]/page.tsx",
      "components/library/FavoritesSection.tsx",
      "components/library/SongIndex.tsx",
    ]);
  });
});
