// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { footerContent } from "@/content/footer";

import { AppFooter } from "./AppFooter";

afterEach(cleanup);

describe("AppFooter", () => {
  it("is one quiet line: copyright, Support and the developer credit", () => {
    render(<AppFooter />);
    const footer = screen.getByRole("contentinfo");
    expect(footer.getAttribute("data-footer")).toBe("app");
    expect(footer.textContent).toContain(`${new Date().getFullYear()} Faithful Word Music`);
    expect(screen.getByRole("link", { name: footerContent.app.support }).getAttribute("href")).toBe("/contact");
    const credit = screen.getByRole("link", { name: new RegExp(`^${footerContent.developer.name}`) });
    expect(credit.getAttribute("href")).toBe(footerContent.developer.href);
    expect(credit.getAttribute("rel")).toContain("noopener");
  });

  it("repeats none of the public footer: no navigation, brand blurb or resources", () => {
    render(<AppFooter />);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByText(footerContent.blurb)).toBeNull();
    for (const resource of footerContent.resources) expect(screen.queryByText(resource.label)).toBeNull();
  });
});
