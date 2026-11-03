// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/use-page-path", () => ({ usePagePath: () => "/dashboard" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { NavMenu } = await import("./NavMenu");

afterEach(cleanup);

const tools = {
  label: "Tools",
  href: "/service-planner",
  children: [
    { label: "Service Planner", href: "/service-planner" },
    { label: "Conductor", href: "/conductor" },
  ],
};

function renderMenu() {
  return render(
    <>
      <ul>
        <NavMenu item={tools} isActive={() => false} fallbackFocus={() => document.getElementById("menu-button")} />
      </ul>
      <button id="menu-button" type="button">
        Open menu
      </button>
    </>,
  );
}

const button = () => screen.getByRole("button", { name: "Tools" });

describe("NavMenu", () => {
  it("is a disclosure of plain links, not an ARIA menu", () => {
    renderMenu();
    fireEvent.click(button());
    expect(button().getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(button().getAttribute("aria-controls")!)!;
    expect(panel.getAttribute("role")).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/service-planner", "/conductor"]);
  });

  it("Down opens it into the first link; Up/Down move; Escape returns to the button", async () => {
    renderMenu();
    fireEvent.keyDown(button(), { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("link", { name: "Service Planner" })));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Conductor" }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Service Planner" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(button().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button());
  });

  it("stays in the page beside its button, so Tab runs on through the bar", () => {
    const { container } = renderMenu();
    fireEvent.click(button());
    const panel = document.getElementById(button().getAttribute("aria-controls")!)!;
    expect(container.contains(panel)).toBe(true);
    expect(button().closest("li")!.contains(panel)).toBe(true);
  });

  it("when the bar is put away while open, it closes and focus goes to the menu button", async () => {
    renderMenu();
    fireEvent.keyDown(button(), { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("link", { name: "Service Planner" })));
    button().getClientRects = () => [] as unknown as DOMRectList;
    window.dispatchEvent(new Event("resize"));
    await waitFor(() => expect(button().getAttribute("aria-expanded")).toBe("false"));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open menu" }));
  });
});
