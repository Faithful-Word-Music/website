// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccountState } from "@/components/account/AccountContext";
import type { FavoriteEntry, FavoritesPage } from "@/lib/favorites-api";
import type { LibrarySong } from "@/lib/library";
import { SIGNED_OUT } from "@/lib/navigation";

const test = vi.hoisted(() => ({ account: null as unknown, path: "/library" }));

vi.mock("@/components/account/AccountContext", () => ({ useAccount: () => test.account }));
vi.mock("@/components/ui/use-page-path", () => ({ usePagePath: () => test.path }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("@/components/ui/use-flip", () => ({ useFlip: () => undefined }));

import { FavoriteButton } from "./FavoriteButton";
import { favoritesAccess, FavoritesProvider } from "./FavoritesProvider";
import { FavoritesSection } from "./FavoritesSection";
import { LibrarySectionNav } from "./LibrarySectionNav";
import { SongIndex } from "./SongIndex";

const me = (profileAttention: "none" | "due" | "blocked" = "none") => ({
  permissions: [], canAccessAdmin: false, canViewSheetMusic: false, title: null, profileAttention,
});
const account = (userId: string | null, details: ReturnType<typeof me> | null = me(), overrides: Partial<AccountState> = {}) => ({
  isLoaded: true, isSignedIn: userId !== null, userId, me: userId ? details : null, meSettled: true, nav: SIGNED_OUT, ...overrides,
}) as AccountState;

const song = (songId: string, title: string, number: string | null = null): LibrarySong => ({
  id: songId, songId, title, number, collection: "SSSH", slug: `${title.toLowerCase().replace(/ /g, "-")}-${songId.toLowerCase()}`, sheetMusic: false,
});
const entry = (songId: string, title: string, number: string | null = "1"): FavoriteEntry => ({
  kind: "song", key: songId, songId, title, number, collection: "SSSH", href: `/library/songs/${songId}`, addedAt: "2026-01-01T00:00:00.000000Z",
});
const listPage = (items: FavoriteEntry[], extra: Partial<FavoritesPage> = {}): FavoritesPage => ({
  items, nextCursor: null, matched: items.length, total: items.length, sort: "recent", directory: "ok", ...extra,
});
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let handler: Handler;
const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)));
const callsTo = (fragment: string) => fetchMock.mock.calls.filter(([url]) => String(url).includes(fragment));
const memberAnswer: Handler = (url, init) => {
  if (url.endsWith("/membership")) {
    const { ids } = JSON.parse(String(init?.body)) as { ids: string[] };
    return json({ ok: true, songs: Object.fromEntries(ids.map((id) => [id, { state: "not-favorited", songId: id }])) });
  }
  return json({ ok: false, code: "unavailable", error: "x" }, 503);
};

const provider = (children: ReactNode) => <FavoritesProvider>{children}</FavoritesProvider>;

beforeEach(() => {
  fetchMock.mockClear();
  handler = memberAnswer;
  test.path = "/library";
  test.account = account("user_a");
  vi.stubGlobal("fetch", fetchMock);
  // No IntersectionObserver: every row counts as on screen.
  vi.stubGlobal("IntersectionObserver", undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("who sees Favorites", () => {
  it("treats only a confirmed, unblocked account as a member", () => {
    expect(favoritesAccess(account(null))).toEqual({ access: "none", accountId: null });
    expect(favoritesAccess(account("user_a", me(), { isLoaded: false }))).toEqual({ access: "none", accountId: null });
    expect(favoritesAccess(account("user_a", me(), { meSettled: false }))).toEqual({ access: "none", accountId: null });
    expect(favoritesAccess(account("user_a", null))).toEqual({ access: "none", accountId: null });
    expect(favoritesAccess(account("user_a", me("blocked")))).toEqual({ access: "blocked", accountId: null });
    expect(favoritesAccess(account("user_a", me("due")))).toEqual({ access: "member", accountId: "user_a" });
  });

  it("shows a visitor no heart or section links, and sends no request", async () => {
    test.account = account(null);
    render(provider(<><LibrarySectionNav /><SongIndex songs={[song("S-1", "Amazing Grace", "10")]} /></>));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByRole("button", { name: /favorites/i })).toBeNull();
    expect(screen.queryByRole("link", { name: "Favorites" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the public index's search and links for a visitor", () => {
    test.account = account(null);
    render(provider(<SongIndex songs={[song("S-1", "Amazing Grace", "10"), song("S-2", "Crown Him", "20")]} />));
    expect(screen.getByRole("link", { name: /Amazing Grace/ }).getAttribute("href")).toContain("/library/songs/");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "crown" } });
    expect(screen.queryByRole("link", { name: /Amazing Grace/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Crown Him/ })).toBeTruthy();
  });

  it("sends no private request while the account is still loading", async () => {
    test.account = account("user_a", me(), { isLoaded: false });
    render(provider(<FavoriteButton songId="S-1" title="Amazing Grace" />));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows a blocked account a disabled heart and asks nothing", async () => {
    test.account = account("user_a", me("blocked"));
    render(provider(<FavoriteButton songId="S-1" title="Amazing Grace" labelled />));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.getByRole("button").getAttribute("aria-disabled")).toBe("true");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the section navigation", () => {
  it("uses real links with the current page marked, and no tab semantics", () => {
    test.path = "/library/favorites";
    render(provider(<LibrarySectionNav />));
    const nav = screen.getByRole("navigation", { name: "Library sections" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["All Songs", "Favorites"]);
    expect(within(nav).getByRole("link", { name: "Favorites" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "All Songs" }).getAttribute("aria-current")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });
});

describe("the heart", () => {
  const ready = async (title = "Amazing Grace") => {
    const button = await screen.findByRole("button", { name: `Add ${title} to favorites` });
    return button;
  };

  it("moves from unknown to a pressed state, with accessible names", async () => {
    render(provider(<FavoriteButton songId="S-1" title="Amazing Grace" />));
    expect(screen.getByRole("button", { name: /Checking whether Amazing Grace/ }).getAttribute("aria-pressed")).toBeNull();
    const button = await ready();
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("changes at once when pressed and sends an explicit state", async () => {
    let release: (response: Response) => void = () => undefined;
    handler = (url, init) => (init?.method === "PUT" ? new Promise<Response>((resolve) => { release = resolve; }) : memberAnswer(url, init));
    render(provider(<FavoriteButton songId="S-1" title="Amazing Grace" />));
    fireEvent.click(await ready());
    const pressed = screen.getByRole("button", { name: "Remove Amazing Grace from favorites" });
    expect(pressed.getAttribute("aria-pressed")).toBe("true");
    expect(pressed.getAttribute("aria-busy")).toBe("true");
    const [, init] = callsTo("/favorites/S-1")[0];
    expect(JSON.parse(String(init?.body))).toEqual({ favorite: true, expectedAccount: "user_a" });
    await act(async () => release(json({ ok: true, songId: "S-1", favorite: true, changed: true })));
    await waitFor(() => expect(screen.getByRole("button", { name: /Remove Amazing/ }).getAttribute("aria-busy")).toBeNull());
  });

  it("draws saved and unsaved differently, not by colour alone", async () => {
    handler = (url, init) => (init?.method === "PUT" ? json({ ok: true, songId: "S-1", favorite: true, changed: true }) : memberAnswer(url, init));
    const { container } = render(provider(<FavoriteButton songId="S-1" title="Amazing Grace" />));
    const button = await ready();
    expect(container.querySelector("button path")?.getAttribute("fill")).toBeNull();
    fireEvent.click(button);
    await screen.findByRole("button", { name: /Remove Amazing/ });
    expect(container.querySelector("button path")?.getAttribute("fill")).toBe("currentColor");
  });

  it("sits beside a song's link in the index, never inside it", async () => {
    const { container } = render(provider(<SongIndex songs={[song("S-1", "Amazing Grace", "10")]} />));
    const button = await ready();
    expect(button.closest("a")).toBeNull();
    expect(container.querySelector("a button")).toBeNull();
    const before = window.location.href;
    fireEvent.click(button);
    expect(window.location.href).toBe(before);
  });

  it("asks about many rows in one request", async () => {
    const songs = Array.from({ length: 150 }, (_, i) => song(`S-${i}`, `Song ${i}`));
    render(provider(<SongIndex songs={songs} />));
    await screen.findAllByRole("button", { name: /^Add Song/ });
    expect(callsTo("/membership")).toHaveLength(1);
  });

  it("hides the heart in a list for an identity that cannot be saved, and explains on its page", async () => {
    handler = () => json({ ok: true, songs: { "legacy-t-x": { state: "unsupported" } } });
    const { unmount } = render(provider(<FavoriteButton songId="legacy-t-x" title="Old Song" />));
    await waitFor(() => expect(screen.queryByRole("button")).toBeNull());
    unmount();
    render(provider(<FavoriteButton songId="legacy-t-x" title="Old Song" labelled />));
    const button = await screen.findByRole("button", { name: "Old Song cannot be added to favorites" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button);
    expect(callsTo("/favorites/legacy")).toHaveLength(0);
  });

  it("explains a definite failure and returns to the saved truth", async () => {
    handler = (url, init) => (init?.method === "PUT" ? json({ ok: false, code: "directory-unavailable", error: "x" }, 503) : memberAnswer(url, init));
    render(provider(<FavoriteButton songId="S-1" title="Amazing Grace" />));
    fireEvent.click(await ready());
    expect((await screen.findByRole("alert")).textContent).toContain("could not be loaded");
    expect(screen.getByRole("button", { name: /Add Amazing/ }).getAttribute("aria-pressed")).toBe("false");
  });

  describe("after a lost response", () => {
    const losing: Handler = (url, init) => {
      if (init?.method === "PUT") throw new TypeError("network");
      return memberAnswer(url, init);
    };

    it("offers an explicit choice, and an ordinary click sends nothing", async () => {
      handler = losing;
      render(provider(<FavoriteButton songId="S-1" title="Amazing Grace" />));
      fireEvent.click(await ready());
      const button = await screen.findByRole("button", { name: /could not confirm/ });
      expect(callsTo("/favorites/S-1")).toHaveLength(1);
      fireEvent.click(button);
      expect(callsTo("/favorites/S-1")).toHaveLength(1);
      const panel = screen.getByRole("group", { name: "We could not confirm that change" });
      expect(panel.textContent).toContain("An earlier request may still finish");
      expect(within(panel).getByRole("button", { name: "Add to favorites" })).toBeTruthy();
      expect(within(panel).getByRole("button", { name: "Remove from favorites" })).toBeTruthy();
    });

    it("sends one request for the chosen state", async () => {
      handler = losing;
      render(provider(<FavoriteButton songId="S-1" title="Amazing Grace" />));
      fireEvent.click(await ready());
      fireEvent.click(await screen.findByRole("button", { name: /could not confirm/ }));
      handler = (url, init) => (init?.method === "PUT" ? json({ ok: true, songId: "S-1", favorite: false, changed: false }) : memberAnswer(url, init));
      fireEvent.click(screen.getByRole("button", { name: "Remove from favorites" }));
      await screen.findByRole("button", { name: /Add Amazing/ });
      const puts = callsTo("/favorites/S-1");
      expect(puts).toHaveLength(2);
      expect(JSON.parse(String(puts[1][1]?.body)).favorite).toBe(false);
    });

    it("closes with Escape and returns focus", async () => {
      handler = losing;
      render(provider(<FavoriteButton songId="S-1" title="Amazing Grace" />));
      fireEvent.click(await ready());
      const button = await screen.findByRole("button", { name: /could not confirm/ });
      fireEvent.click(button);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("group")).toBeNull();
      expect(document.activeElement).toBe(button);
    });
  });

  it("never shows the previous account's state after a switch", async () => {
    handler = (url, init) => {
      if (url.endsWith("/membership")) {
        const favorited = test.account && (test.account as AccountState).userId === "user_a";
        const { ids } = JSON.parse(String(init?.body)) as { ids: string[] };
        return json({ ok: true, songs: Object.fromEntries(ids.map((id) => [id, { state: favorited ? "favorited" : "not-favorited", songId: id }])) });
      }
      return json({}, 500);
    };
    const { rerender } = render(provider(<FavoriteButton songId="S-1" title="Amazing Grace" />));
    await screen.findByRole("button", { name: /Remove Amazing/ });
    test.account = account("user_b");
    rerender(provider(<FavoriteButton songId="S-1" title="Amazing Grace" />));
    expect(screen.queryByRole("button", { name: /Remove Amazing/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Checking whether/ })).toBeTruthy();
    await screen.findByRole("button", { name: /Add Amazing/ });
  });

  it("drops the heart at once on sign-out", async () => {
    const { rerender } = render(provider(<FavoriteButton songId="S-1" title="Amazing Grace" />));
    await ready();
    test.account = account(null);
    rerender(provider(<FavoriteButton songId="S-1" title="Amazing Grace" />));
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("the Favorites section", () => {
  const withList = (build: (url: URL) => Response): Handler => (url, init) => {
    if (url.startsWith("/api/account/favorites?")) return build(new URL(url, "https://x.test"));
    return memberAnswer(url, init);
  };
  const section = () => render(provider(<FavoritesSection />));

  it("explains an empty collection and links to all songs", async () => {
    handler = withList(() => json(listPage([])));
    section();
    expect(await screen.findByRole("heading", { name: "No favorites yet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Browse all songs" }).getAttribute("href")).toBe("/library");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("lists songs with links and hearts, needing no membership request", async () => {
    handler = withList(() => json(listPage([entry("S-1", "Amazing Grace", "10")])));
    section();
    const link = await screen.findByRole("link", { name: /Amazing Grace/ });
    expect(link.getAttribute("href")).toBe("/library/songs/S-1");
    expect(await screen.findByRole("button", { name: "Remove Amazing Grace from favorites" })).toBeTruthy();
    expect(callsTo("/membership")).toHaveLength(0);
  });

  it("searches on the server and tells no-match from empty", async () => {
    handler = withList((url) => (url.searchParams.get("q")
      ? json(listPage([], { total: 3, matched: 0 }))
      : json(listPage([entry("S-1", "Amazing Grace")], { total: 3, matched: 3 }))));
    section();
    await screen.findByRole("link", { name: /Amazing Grace/ });
    fireEvent.change(screen.getByRole("combobox", { name: "Search your favorites" }), { target: { value: "zebra" } });
    expect(await screen.findByText("No favorites match “zebra”")).toBeTruthy();
    // The search box has its own clear control; this is the one in the no-results message.
    fireEvent.click(screen.getAllByRole("button", { name: "Clear search" }).at(-1)!);
    expect(await screen.findByRole("link", { name: /Amazing Grace/ })).toBeTruthy();
  });

  it("offers all three sorts, Recently Added first, and asks the server", async () => {
    handler = withList(() => json(listPage([entry("S-1", "Amazing Grace")])));
    section();
    await screen.findByRole("link", { name: /Amazing Grace/ });
    const select = screen.getByLabelText("Sort by") as HTMLSelectElement;
    expect([...select.options].map((option) => option.text)).toEqual(["Recently Added", "Alphabetical", "Hymn Number"]);
    expect(select.value).toBe("recent");
    fireEvent.change(select, { target: { value: "number" } });
    await waitFor(() => expect(callsTo("sort=number").length).toBeGreaterThan(0));
  });

  it("loads more with the cursor, keeping what is shown", async () => {
    handler = withList((url) => (url.searchParams.get("cursor")
      ? json(listPage([entry("S-2", "Crown Him")], { total: 2, matched: 2 }))
      : json(listPage([entry("S-1", "Amazing Grace")], { nextCursor: "next", total: 2, matched: 2 }))));
    section();
    await screen.findByRole("link", { name: /Amazing Grace/ });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("link", { name: /Crown Him/ });
    expect(screen.getByRole("link", { name: /Amazing Grace/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("starts again when a cursor has gone stale", async () => {
    let first = true;
    handler = withList((url) => {
      if (url.searchParams.get("cursor")) return json({ ok: false, code: "invalid-cursor", error: "x" }, 400);
      const result = first ? listPage([entry("S-1", "Amazing Grace")], { nextCursor: "old", total: 2, matched: 2 }) : listPage([entry("S-9", "Reloaded")]);
      first = false;
      return json(result);
    });
    section();
    await screen.findByRole("link", { name: /Amazing Grace/ });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("link", { name: /Reloaded/ })).toBeTruthy();
  });

  it("offers a retry after a failed load, saying nothing was lost", async () => {
    let fail = true;
    handler = withList(() => (fail ? json({ ok: false, code: "unavailable", error: "x" }, 503) : json(listPage([entry("S-1", "Amazing Grace")]))));
    section();
    expect(await screen.findByText("Nothing has been lost. Please try again.")).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: /Amazing Grace/ })).toBeTruthy();
  });

  it("shows unavailable entries with no guessed title or link, and removes them exactly", async () => {
    const gone: FavoriteEntry = { kind: "unavailable", key: "GONE-1", addedAt: "2026-01-01T00:00:00.000000Z" };
    handler = (url, init) => {
      if (init?.method === "PUT") return json({ ok: true, songId: "GONE-1", favorite: false, changed: true });
      return withList(() => json(listPage([gone, entry("S-1", "Amazing Grace")])))(url, init);
    };
    section();
    expect(await screen.findByText("Song no longer listed")).toBeTruthy();
    expect(screen.queryByText("GONE-1")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove this entry from favorites" }));
    await waitFor(() => expect(screen.queryByText("Song no longer listed")).toBeNull());
    const [, init] = callsTo("/favorites/GONE-1")[0];
    expect(JSON.parse(String(init?.body))).toEqual({ favorite: false, exact: true, expectedAccount: "user_a" });
  });

  it.each([
    ["ambiguous", "Song could not be identified"],
    ["unknown", "Song details unavailable"],
  ] as const)("presents a %s entry distinctly", async (kind, text) => {
    handler = withList(() => json(listPage([{ kind, key: "X-1", addedAt: "2026-01-01T00:00:00.000000Z" }])));
    section();
    expect(await screen.findByText(text)).toBeTruthy();
  });

  it("explains a directory outage without suggesting Favorites are gone", async () => {
    handler = withList(() => json(listPage([{ kind: "unknown", key: "S-1", addedAt: "2026-01-01T00:00:00.000000Z" }], { directory: "unavailable" })));
    section();
    expect(await screen.findByText(/Your favorites are safe/)).toBeTruthy();
    expect((screen.getByLabelText("Sort by") as HTMLSelectElement).disabled).toBe(true);
  });

  it("explains a search that needs the unavailable directory", async () => {
    handler = withList((url) => (url.searchParams.get("q")
      ? json({ ok: false, code: "directory-unavailable", error: "x" }, 503)
      : json(listPage([entry("S-1", "Amazing Grace")]))));
    section();
    await screen.findByRole("link", { name: /Amazing Grace/ });
    fireEvent.change(screen.getByRole("combobox", { name: "Search your favorites" }), { target: { value: "grace" } });
    expect(await screen.findByText(/Search needs song details/)).toBeTruthy();
  });

  it("clears one account's list before the next account's arrives", async () => {
    let owner = "A's Song";
    handler = withList(() => json(listPage([entry("S-1", owner)])));
    const { rerender } = section();
    await screen.findByRole("link", { name: /A's Song/ });
    owner = "B's Song";
    test.account = account("user_b");
    rerender(provider(<FavoritesSection />));
    expect(screen.queryByRole("link", { name: /A's Song/ })).toBeNull();
    expect(await screen.findByRole("link", { name: /B's Song/ })).toBeTruthy();
  });

  it("explains an ended session instead of loading forever", () => {
    test.account = account(null);
    section();
    expect(screen.getByText("Your session has ended. Please log in again.")).toBeTruthy();
  });

  it("explains a blocked profile", () => {
    test.account = account("user_a", me("blocked"));
    section();
    expect(screen.getByRole("heading", { name: "Favorites are not available for this account" })).toBeTruthy();
  });
});
