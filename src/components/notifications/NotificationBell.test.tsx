// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  signedIn: true,
  unread: 0,
  wide: true,
  path: "/dashboard",
  synced: [] as Array<string | null>,
  loads: 0,
}));

vi.mock("@/components/account/AccountContext", () => ({
  useAccount: () => ({ isSignedIn: state.signedIn, userId: state.signedIn ? "user_1" : null }),
}));

// The store itself is tested in notification-store.test.ts: here, only that the bell drives it as before.
vi.mock("./notification-store", () => ({
  useNotificationSync: (userId: string | null) => {
    state.synced.push(userId);
  },
  useNotifications: () => ({ unread: state.unread, items: [], loaded: true, loading: false, error: null }),
  loadNotifications: () => {
    state.loads += 1;
    return Promise.resolve();
  },
  markAllNotificationsRead: vi.fn(),
  markNotification: vi.fn(),
}));

vi.mock("@/components/ui/use-page-path", () => ({ usePagePath: () => state.path }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { NotificationBell } = await import("./NotificationBell");

beforeEach(() => {
  Object.assign(state, { signedIn: true, unread: 0, wide: true, path: "/dashboard", synced: [], loads: 0 });
  window.matchMedia = ((query: string) => ({
    matches: query === "(min-width: 640px)" ? state.wide : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

const bell = () => screen.getByRole("button", { name: /^Notifications/ });

describe("NotificationBell", () => {
  it("shows nothing to a visitor, and syncs no one", () => {
    state.signedIn = false;
    const { container } = render(<NotificationBell />);
    expect(container.innerHTML).toBe("");
    expect(state.synced.every((id) => id === null)).toBe(true);
  });

  it("keeps the person's notifications in sync while signed in", () => {
    render(<NotificationBell />);
    expect(state.synced.at(-1)).toBe("user_1");
  });

  it("says the count in its name, and shows it on a badge hidden from screen readers", () => {
    state.unread = 3;
    render(<NotificationBell />);
    expect(bell().getAttribute("aria-label")).toBe("Notifications, 3 unread");
    const badge = bell().querySelector("[data-count-badge]")!;
    expect(badge.textContent).toBe("3");
    expect(badge.getAttribute("aria-hidden")).toBe("true");
  });

  it("no badge with nothing unread", () => {
    render(<NotificationBell />);
    expect(bell().getAttribute("aria-label")).toBe("Notifications");
    expect(bell().querySelector("[data-count-badge]")).toBeNull();
  });

  it("wide: opens a non-modal dialog panel, focused, loading the latest; Escape closes it back to the bell", async () => {
    render(<NotificationBell />);
    fireEvent.click(bell());
    expect(state.loads).toBe(1);
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(panel.tagName).toBe("DIV");
    expect(bell().getAttribute("aria-controls")).toBe(panel.id);
    expect(within(panel).getByRole("link", { name: "View all notifications" }).getAttribute("href")).toBe("/notifications");
    await waitFor(() => expect(document.activeElement).toBe(panel));
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(bell());
  });

  it("wide: a press elsewhere closes the panel", () => {
    render(
      <>
        <NotificationBell />
        <p>Page</p>
      </>,
    );
    fireEvent.click(bell());
    fireEvent.pointerDown(screen.getByText("Page"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("phones: the same list opens as the site's modal dialog, unchanged", async () => {
    state.wide = false;
    render(<NotificationBell />);
    fireEvent.click(bell());
    const dialog = await screen.findByRole("dialog");
    expect(dialog.tagName).toBe("DIALOG");
    expect(bell().getAttribute("aria-controls")).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Mark all as read" })).toBeTruthy();
  });

  it("a change of page closes it", () => {
    const { rerender } = render(<NotificationBell />);
    fireEvent.click(bell());
    state.path = "/profile";
    rerender(<NotificationBell />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
