// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scrollsWithin, useScrollLock } from "./use-scroll-lock";

function Lock({ active = true }: { active?: boolean }) {
  useScrollLock(active);
  return null;
}

const html = document.documentElement;

/** The page's scrollbar: `width` px of room (a desktop's), or 0 (floating, as on phones). */
function scrollbar(width: number) {
  Object.defineProperty(html, "clientWidth", { value: window.innerWidth - width, configurable: true });
}

/** A scrolling box `scrollTop` px down a 300px list in a 100px window. */
function scroller(scrollTop: number) {
  const box = document.createElement("div");
  box.style.overflowY = "auto";
  Object.defineProperty(box, "scrollHeight", { value: 300, configurable: true });
  Object.defineProperty(box, "clientHeight", { value: 100, configurable: true });
  box.scrollTop = scrollTop;
  const row = box.appendChild(document.createElement("p"));
  document.body.appendChild(box);
  return { box, row };
}

const wheel = (target: EventTarget, deltaY: number, extra: WheelEventInit = {}) => {
  const event = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true, ...extra });
  // happy-dom's WheelEvent leaves out the modifier keys it is given.
  if (extra.ctrlKey) Object.defineProperty(event, "ctrlKey", { value: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
};
const key = (target: EventTarget, key: string) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
};

beforeEach(() => {
  html.style.overflow = "";
  html.style.removeProperty("--scrollbar-gap");
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("useScrollLock with a scrollbar that takes room (desktop)", () => {
  beforeEach(() => scrollbar(15));

  it("leaves the scrollbar showing, and publishes its width", () => {
    render(<Lock />);
    expect(html.style.overflow).toBe("");
    expect(html.style.getPropertyValue("--scrollbar-gap")).toBe("15px");
  });

  it("stops the wheel scrolling the page", () => {
    render(<Lock />);
    expect(wheel(document.body, 100)).toBe(true);
  });

  it("lets the wheel scroll a box inside the overlay - until that box is at its end", () => {
    render(<Lock />);
    const middle = scroller(50);
    expect(wheel(middle.row, 100)).toBe(false);
    expect(wheel(middle.row, -100)).toBe(false);
    const top = scroller(0);
    expect(wheel(top.row, -100)).toBe(true);
    const bottom = scroller(200);
    expect(wheel(bottom.row, 100)).toBe(true);
  });

  it("leaves Ctrl + wheel (the browser's zoom) alone", () => {
    render(<Lock />);
    expect(wheel(document.body, 100, { ctrlKey: true })).toBe(false);
  });

  it("stops the scrolling keys, but not typing or pressing a control with Space", () => {
    render(<Lock />);
    expect(key(document.body, "PageDown")).toBe(true);
    expect(key(document.body, " ")).toBe(true);
    const input = document.body.appendChild(document.createElement("input"));
    input.focus();
    expect(key(input, "ArrowDown")).toBe(false);
    expect(key(input, " ")).toBe(false);
    const button = document.body.appendChild(document.createElement("button"));
    button.focus();
    expect(key(button, " ")).toBe(false);
    expect(key(document.body, "a")).toBe(false);
  });

  it("puts the page back if something scrolls it anyway (the scrollbar dragged)", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(<Lock />);
    Object.defineProperty(window, "scrollY", { value: 400, configurable: true });
    window.dispatchEvent(new Event("scroll"));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    scrollTo.mockRestore();
  });

  it("lets go entirely once the last lock is released", () => {
    const first = render(<Lock />);
    const second = render(<Lock />);
    first.unmount();
    expect(wheel(document.body, 100)).toBe(true);
    second.unmount();
    expect(wheel(document.body, 100)).toBe(false);
    expect(html.style.getPropertyValue("--scrollbar-gap")).toBe("");
  });
});

describe("useScrollLock with a floating scrollbar (phones)", () => {
  beforeEach(() => scrollbar(0));

  it("hides the page's overflow, and puts it back", () => {
    const { unmount } = render(<Lock />);
    expect(html.style.overflow).toBe("hidden");
    expect(html.style.getPropertyValue("--scrollbar-gap")).toBe("");
    unmount();
    expect(html.style.overflow).toBe("");
  });

  it("does nothing while inactive", () => {
    render(<Lock active={false} />);
    expect(html.style.overflow).toBe("");
  });
});

describe("scrollsWithin", () => {
  it("is false for the page itself", () => {
    expect(scrollsWithin(document.body, 0, 100)).toBe(false);
    expect(scrollsWithin(null, 0, 100)).toBe(false);
  });
});
