import { describe, expect, it } from "vitest";

import { computePopoverPosition } from "./position";

const viewport = { width: 1280, height: 800 };
const size = { width: 240, height: 300 };
/** A 44px button near the top right of the header. */
const button = { top: 10, bottom: 54, left: 1180, right: 1224 };

describe("computePopoverPosition", () => {
  it("opens below, right edges aligned, a gap from the control", () => {
    const at = computePopoverPosition({ anchor: button, size, viewport, placement: "bottom-end" });
    expect(at).toMatchObject({ top: 62, left: 1224 - 240, placement: "bottom-end" });
    expect(at.maxHeight).toBe(800 - 54 - 8 - 8);
  });

  it("lines up with the control's start edge for -start", () => {
    const at = computePopoverPosition({ anchor: { top: 10, bottom: 54, left: 300, right: 400 }, size, viewport, placement: "bottom-start" });
    expect(at.left).toBe(300);
  });

  it("is kept inside the window's edges", () => {
    const nearLeft = computePopoverPosition({ anchor: { top: 10, bottom: 54, left: 2, right: 46 }, size, viewport, placement: "bottom-end" });
    expect(nearLeft.left).toBe(8);
    const nearRight = computePopoverPosition({ anchor: { top: 10, bottom: 54, left: 1250, right: 1294 }, size, viewport, placement: "bottom-start" });
    expect(nearRight.left).toBe(1280 - 8 - 240);
  });

  it("stays clear of Conductor's panel on the right", () => {
    // The drawer takes 420px: the page (and the button) end at 860.
    const anchor = { top: 10, bottom: 54, left: 800, right: 844 };
    const at = computePopoverPosition({ anchor, size, viewport: { ...viewport, insetRight: 420 }, placement: "bottom-start" });
    expect(at.left + size.width).toBeLessThanOrEqual(1280 - 420 - 8);
  });

  it("pins a popover wider than the room to the left edge", () => {
    const at = computePopoverPosition({ anchor: button, size: { width: 400, height: 100 }, viewport: { width: 320, height: 600 }, placement: "bottom-end" });
    expect(at.left).toBe(8);
  });

  it("flips above when there is no room below and more above", () => {
    const low = { top: 700, bottom: 744, left: 100, right: 144 };
    const at = computePopoverPosition({ anchor: low, size, viewport, placement: "bottom-start" });
    expect(at.placement).toBe("top-start");
    expect(at.top).toBe(700 - 8 - 300);
    expect(at.maxHeight).toBe(700 - 8 - 8);
  });

  it("flips below when asked for above but there is no room there", () => {
    const at = computePopoverPosition({ anchor: button, size, viewport, placement: "top-end" });
    expect(at.placement).toBe("bottom-end");
  });

  it("stays on the asked side when the other has no more room, and caps its height", () => {
    // A short window: neither side fits 300px; below has more, so below it stays.
    const at = computePopoverPosition({ anchor: button, size, viewport: { width: 1280, height: 250 }, placement: "bottom-end" });
    expect(at.placement).toBe("bottom-end");
    expect(at.maxHeight).toBe(250 - 54 - 16);
  });

  it("when flipped above with less room than its height, sits right above the control", () => {
    const anchor = { top: 200, bottom: 244, left: 0, right: 44 };
    const at = computePopoverPosition({ anchor, size: { width: 100, height: 500 }, viewport: { width: 800, height: 300 }, placement: "bottom-start" });
    expect(at.placement).toBe("top-start");
    expect(at.top + Math.min(500, at.maxHeight)).toBe(200 - 8);
  });
});
