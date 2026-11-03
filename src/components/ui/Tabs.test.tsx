// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { nextTabIndex, resolveTab, Tabs, type TabItem } from "./Tabs";

afterEach(cleanup);

const three: TabItem[] = [
  { id: "week", label: "This week", content: <p>Week panel</p> },
  { id: "next", label: "Next week", content: <p>Next panel</p>, badge: 2, badgeLabel: "2 need a leader" },
  { id: "month", label: "This month", content: <p>Month panel</p> },
];

describe("nextTabIndex", () => {
  it("wraps Left/Right and jumps Home/End", () => {
    expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(nextTabIndex("Home", 2, 3)).toBe(0);
    expect(nextTabIndex("End", 0, 3)).toBe(2);
  });

  it("ignores other keys, and empty rows", () => {
    expect(nextTabIndex("ArrowDown", 0, 3)).toBeNull();
    expect(nextTabIndex("Enter", 0, 3)).toBeNull();
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("resolveTab", () => {
  it("keeps the asked-for tab while it exists, else the first", () => {
    expect(resolveTab(three, "next")).toBe("next");
    expect(resolveTab(three, "gone")).toBe("week");
    expect(resolveTab(three, undefined)).toBe("week");
    expect(resolveTab([], "next")).toBeUndefined();
  });
});

describe("Tabs", () => {
  it("follows the ARIA tabs pattern: one tab in the Tab order, the panel named by its tab", () => {
    render(<Tabs label="Services" tabs={three} />);
    const list = screen.getByRole("tablist", { name: "Services" });
    const tabs = screen.getAllByRole("tab");
    expect(list.getAttribute("aria-orientation")).toBe("horizontal");
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0].id);
    expect(tabs[0].getAttribute("aria-controls")).toBe(panel.id);
    // Only the selected tab points at a panel that is in the page.
    expect(tabs[1].getAttribute("aria-controls")).toBeNull();
    expect(panel.textContent).toBe("Week panel");
  });

  it("arrows move and select (wrapping); Home/End jump; focus follows", () => {
    render(<Tabs label="Services" tabs={three} />);
    const tabs = () => screen.getAllByRole("tab");
    tabs()[0].focus();
    fireEvent.keyDown(tabs()[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs()[1].getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toBe("Next panel");
    fireEvent.keyDown(tabs()[1], { key: "End" });
    expect(document.activeElement).toBe(tabs()[2]);
    fireEvent.keyDown(tabs()[2], { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs()[0]);
    fireEvent.keyDown(tabs()[0], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabs()[2]);
    fireEvent.keyDown(tabs()[2], { key: "Home" });
    expect(document.activeElement).toBe(tabs()[0]);
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
  });

  it("Tab moves from the selected tab into the panel", async () => {
    render(<Tabs label="Services" tabs={three} defaultValue="next" />);
    screen.getAllByRole("tab")[1].focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("tabpanel"));
  });

  it("a click selects; a badge is read with what it counts", async () => {
    render(<Tabs label="Services" tabs={three} />);
    await userEvent.click(screen.getByRole("tab", { name: /Next week/ }));
    expect(screen.getByRole("tabpanel").textContent).toBe("Next panel");
    expect(screen.getByRole("tab", { name: /Next week/ }).textContent).toContain("2 need a leader");
  });

  it("controlled: shows `value` and reports changes without moving on its own", () => {
    const onValueChange = vi.fn();
    render(<Tabs label="Services" tabs={three} value="month" onValueChange={onValueChange} />);
    expect(screen.getByRole("tabpanel").textContent).toBe("Month panel");
    fireEvent.click(screen.getByRole("tab", { name: "This week" }));
    expect(onValueChange).toHaveBeenCalledWith("week");
    expect(screen.getByRole("tabpanel").textContent).toBe("Month panel");
  });

  it("one tab: just its panel, no row; none: nothing", () => {
    const { container, rerender } = render(<Tabs label="Services" tabs={[three[0]]} />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(container.textContent).toBe("Week panel");
    rerender(<Tabs label="Services" tabs={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("a changing set: the selected tab going away selects the first, and focus is not lost", () => {
    function Dynamic() {
      const [tabs, setTabs] = useState(three);
      return (
        <>
          <button type="button" onClick={() => setTabs(three.filter((tab) => tab.id !== "next"))}>
            Drop next
          </button>
          <Tabs label="Services" tabs={tabs} defaultValue="next" />
        </>
      );
    }
    render(<Dynamic />);
    const selected = screen.getByRole("tab", { name: /Next week/ });
    selected.focus();
    expect(document.activeElement).toBe(selected);
    act(() => {
      screen.getByText("Drop next").click();
    });
    // The focused tab was removed: focus goes to the newly selected one.
    const first = screen.getByRole("tab", { name: "This week" });
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toBe("Week panel");
    expect(document.activeElement).toBe(first);
  });

  it("a changing set: an added tab joins the row without taking the selection", () => {
    const { rerender } = render(<Tabs label="Services" tabs={three.slice(0, 2)} defaultValue="next" />);
    rerender(<Tabs label="Services" tabs={three} defaultValue="next" />);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: /Next week/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("the row scrolls sideways itself to bring the selected tab into view (never the page)", () => {
    render(<Tabs label="Services" tabs={three} />);
    const list = screen.getByRole("tablist");
    const tabs = screen.getAllByRole("tab");
    // happy-dom does not lay out: give the row and tabs their sizes on a phone.
    Object.defineProperty(list, "clientWidth", { value: 200, configurable: true });
    tabs.forEach((tab, i) => {
      Object.defineProperty(tab, "offsetLeft", { value: i * 150, configurable: true });
      Object.defineProperty(tab, "offsetWidth", { value: 120, configurable: true });
    });
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "End" });
    expect(list.scrollLeft).toBe(300 + 120 - 200);
    fireEvent.keyDown(screen.getAllByRole("tab")[2], { key: "Home" });
    expect(list.scrollLeft).toBe(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
