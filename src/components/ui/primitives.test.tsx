// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Badge } from "./Badge";
import { Icon, ICON_PATHS } from "./Icon";
import { Panel } from "./Panel";
import { Skeleton } from "./Skeleton";

afterEach(cleanup);

describe("Badge", () => {
  it("carries its meaning in words, with the tone's semantic tokens", () => {
    render(<Badge tone="danger">Blocked</Badge>);
    const badge = screen.getByText("Blocked").parentElement!;
    expect(badge.className).toContain("bg-danger-bg");
    expect(badge.className).toContain("text-danger");
  });

  it("is neutral by default", () => {
    render(<Badge>Tag</Badge>);
    expect(screen.getByText("Tag").parentElement!.className).toContain("border-line");
  });
});

describe("Skeleton", () => {
  it("is hidden from screen readers and still under reduced motion", () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const block = container.querySelector("[data-skeleton]")!;
    expect(block.getAttribute("aria-hidden")).toBe("true");
    expect(block.className).toContain("motion-reduce:animate-none");
  });

  it("draws text lines, the last one shorter", () => {
    const { container } = render(<Skeleton lines={3} />);
    const bars = container.querySelectorAll("[data-skeleton] > span");
    expect(bars).toHaveLength(3);
    expect(bars[2].className).toContain("w-3/5");
  });
});

describe("Panel", () => {
  it("is a region named by its heading, with its action and footer", () => {
    render(
      <Panel title="Coming up" titleAs="h3" action={<a href="/song-list">See all</a>} footer={<p>Updated now</p>}>
        <p>Body</p>
      </Panel>,
    );
    const region = screen.getByRole("region", { name: "Coming up" });
    expect(screen.getByRole("heading", { level: 3, name: "Coming up" })).toBeTruthy();
    expect(region.querySelector("footer")?.textContent).toBe("Updated now");
    expect(screen.getByRole("link", { name: "See all" })).toBeTruthy();
  });
});

describe("Icon", () => {
  it("is decorative and drawn from the shared paths", () => {
    const { container } = render(<Icon name="bell" size={18} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("width")).toBe("18");
    expect(svg.querySelector("path")?.getAttribute("d")).toBe(ICON_PATHS.bell);
  });
});
