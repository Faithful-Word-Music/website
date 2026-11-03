// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Permission } from "@/lib/auth/permissions";

/* The account's sources, set per test. */
const state = vi.hoisted(() => ({
  signedIn: true,
  permissions: [] as string[],
  profileAttention: "none" as "none" | "due" | "blocked",
  path: "/dashboard",
  calls: [] as string[],
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    user: state.signedIn
      ? { fullName: "Ada Lovelace", imageUrl: "/avatar.png", primaryEmailAddress: { emailAddress: "ada@example.com" } }
      : null,
  }),
  useClerk: () => ({
    signOut: vi.fn(async () => {
      state.calls.push("signOut");
    }),
  }),
}));

vi.mock("@/components/account/AccountContext", () => ({
  useAccount: () => ({
    isLoaded: true,
    isSignedIn: state.signedIn,
    userId: state.signedIn ? "user_1" : null,
    meSettled: true,
    me: state.signedIn
      ? { permissions: state.permissions, canAccessAdmin: false, canViewSheetMusic: false, title: "Pianist", profileAttention: state.profileAttention }
      : null,
    nav: { signedIn: state.signedIn, permissions: new Set(state.permissions as Permission[]) },
  }),
}));

vi.mock("@/components/notifications/push-device", () => ({
  disconnectForSignOut: vi.fn(async () => {
    state.calls.push("disconnect");
  }),
}));

vi.mock("@/components/ui/use-page-path", () => ({ usePagePath: () => state.path }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { UserMenu } = await import("./UserMenu");

beforeEach(() => {
  Object.assign(state, { signedIn: true, permissions: [], profileAttention: "none", path: "/dashboard", calls: [] });
});
afterEach(cleanup);

const avatar = () => screen.getByRole("button", { name: /Account menu/ });

describe("UserMenu", () => {
  it("renders nothing for a visitor", () => {
    state.signedIn = false;
    const { container } = render(<UserMenu wide />);
    expect(container.innerHTML).toBe("");
  });

  it("wide: a disclosure of links under the photo - not an ARIA menu - that Escape closes back to the photo", async () => {
    render(<UserMenu wide />);
    expect(avatar().getAttribute("aria-haspopup")).toBeNull();
    fireEvent.click(avatar());
    expect(avatar().getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(avatar().getAttribute("aria-controls")!)!;
    expect(panel.getAttribute("role")).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(panel).getByText("Ada Lovelace")).toBeTruthy();
    expect(within(panel).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/notifications", "/profile", "/account"]);

    within(panel).getByText("Profile").focus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(avatar().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(avatar());
  });

  it("narrow (phones): the photo opens a sheet dialog holding the same links and Log out", async () => {
    render(<UserMenu wide={false} />);
    expect(avatar().getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(avatar());
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("heading", { name: "Ada Lovelace" })).toBeTruthy();
    expect(within(sheet).getByText("Pianist")).toBeTruthy();
    const nav = within(sheet).getByRole("navigation", { name: "Account menu" });
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/notifications", "/profile", "/account"]);
    expect(within(nav).getByRole("button", { name: "Log out" })).toBeTruthy();
  });

  it("offers Admin only to someone whose permissions open it", async () => {
    state.permissions = ["manage_users"];
    render(<UserMenu wide={false} />);
    fireEvent.click(avatar());
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("link", { name: "Admin" }).getAttribute("href")).toBe("/admin");
  });

  it("marks the profile when it needs something, in words as well", async () => {
    state.profileAttention = "due";
    render(<UserMenu wide={false} />);
    expect(avatar().getAttribute("aria-label")).toMatch(/^Account menu - /);
    fireEvent.click(avatar());
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("link", { name: /Profile \(/ })).toBeTruthy();
  });

  it("Log out stops this device's push before signing out", async () => {
    render(<UserMenu wide={false} />);
    fireEvent.click(avatar());
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(state.calls).toEqual(["disconnect", "signOut"]));
  });

  it("choosing a link closes the sheet", async () => {
    render(<UserMenu wide={false} />);
    fireEvent.click(avatar());
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("link", { name: "Account settings" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a change of width while open closes it, and focus goes back to the photo", async () => {
    const { rerender } = render(<UserMenu wide />);
    fireEvent.click(avatar());
    const panel = document.getElementById(avatar().getAttribute("aria-controls")!)!;
    const link = within(panel).getByText("Profile");
    link.focus();
    // The panel goes with the change; its focused link with it.
    act(() => rerender(<UserMenu wide={false} />));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(avatar().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(avatar());
  });

  it("a change of page closes it", async () => {
    const { rerender } = render(<UserMenu wide={false} />);
    fireEvent.click(avatar());
    await screen.findByRole("dialog");
    state.path = "/profile";
    rerender(<UserMenu wide={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
