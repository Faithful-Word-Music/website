import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { atLeast } from "./at-least";

describe("atLeast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("holds a fast result until the minimum has passed", async () => {
    const settled = vi.fn();
    void atLeast(Promise.resolve("saved"), 400).then(settled);

    await vi.advanceTimersByTimeAsync(399);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledWith("saved");
  });

  it("adds nothing to work that is already slower than the minimum", async () => {
    const settled = vi.fn();
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve("saved"), 900));
    void atLeast(slow, 400).then(settled);

    await vi.advanceTimersByTimeAsync(899);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledWith("saved");
  });

  it("passes a failure on", async () => {
    const failing = atLeast(Promise.reject(new Error("offline")), 400);
    const assertion = expect(failing).rejects.toThrow("offline");
    await vi.advanceTimersByTimeAsync(400);
    await assertion;
  });
});
