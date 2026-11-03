// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { countLabel } from "@/lib/count-label";

import { CountBadge } from "./CountBadge";

afterEach(cleanup);

describe("countLabel", () => {
  it("is empty at zero and for anything that is not a count", () => {
    expect(countLabel(0)).toBe("");
    expect(countLabel(-2)).toBe("");
    expect(countLabel(Number.NaN)).toBe("");
    expect(countLabel(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("caps at max with a plus", () => {
    expect(countLabel(7)).toBe("7");
    expect(countLabel(99)).toBe("99");
    expect(countLabel(100)).toBe("99+");
    expect(countLabel(12, 9)).toBe("9+");
    expect(countLabel(3.7)).toBe("3");
  });
});

describe("CountBadge", () => {
  it("renders nothing at zero", () => {
    const { container } = render(<CountBadge count={0} label="0 waiting" />);
    expect(container.innerHTML).toBe("");
  });

  it("inline: the number is replaced, for screen readers, by what it counts", () => {
    const { container } = render(<CountBadge count={3} label="3 waiting" />);
    const badge = container.querySelector("[data-count-badge]")!;
    expect(badge.textContent).toBe("33 waiting");
    expect(badge.querySelector('[aria-hidden="true"]')?.textContent).toBe("3");
    expect(screen.getByText("3 waiting").className).toContain("sr-only");
  });

  it("inline without a label: the bare number is read", () => {
    const { container } = render(<CountBadge count={5} />);
    const badge = container.querySelector("[data-count-badge]")!;
    expect(badge.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(badge.textContent).toBe("5");
  });

  it("overlay: hidden from screen readers, capped at 99+", () => {
    const { container } = render(<CountBadge count={250} variant="overlay" />);
    const badge = container.querySelector("[data-count-badge]")!;
    expect(badge.getAttribute("aria-hidden")).toBe("true");
    expect(badge.textContent).toBe("99+");
  });
});
