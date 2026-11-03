// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Popover } from "./Popover";
import type { DismissReason } from "./usePopover";

afterEach(cleanup);

type Extra = Partial<Omit<ComponentProps<typeof Popover>, "id" | "triggerRef" | "onClose" | "children">>;

function Harness({ onClose, extra, startOpen = true }: { onClose?: (reason: DismissReason) => void; extra?: Extra; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fallbackRef = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={triggerRef} type="button" aria-expanded={open} aria-controls="pop" onClick={() => setOpen((v) => !v)}>
        Open
      </button>
      <button ref={fallbackRef} type="button">
        Fallback
      </button>
      <p>Elsewhere</p>
      {open ? (
        <Popover
          id="pop"
          triggerRef={triggerRef}
          fallbackFocus={() => fallbackRef.current}
          onClose={(reason) => {
            onClose?.(reason);
            setOpen(false);
          }}
          {...extra}
        >
          <a href="/one">One</a>
          <a href="/two">Two</a>
        </Popover>
      ) : null}
    </div>
  );
}

const popover = () => document.getElementById("pop");

describe("Popover", () => {
  it("adds no role of its own and passes the caller's through", () => {
    const { unmount } = render(<Harness />);
    expect(popover()?.getAttribute("role")).toBeNull();
    unmount();
    render(<Harness extra={{ role: "dialog", "aria-label": "Notifications", tabIndex: -1 }} />);
    expect(screen.getByRole("dialog", { name: "Notifications" })).toBe(popover());
  });

  it("is fixed-position and stays beside its control in the DOM unless portalled", () => {
    const { container } = render(<Harness />);
    expect(container.contains(popover())).toBe(true);
    expect(popover()?.style.position).toBe("fixed");
  });

  it("portals to <body>, or into the open dialog its control is in", async () => {
    const { container } = render(<Harness extra={{ portal: true }} />);
    await waitFor(() => expect(popover()).not.toBeNull());
    expect(container.contains(popover())).toBe(false);
    expect(popover()?.parentElement).toBe(document.body);
    cleanup();

    const dialog = document.createElement("dialog");
    document.body.appendChild(dialog);
    dialog.setAttribute("open", "");
    render(<Harness extra={{ portal: true }} />, { container: dialog.appendChild(document.createElement("div")) });
    await waitFor(() => expect(popover()).not.toBeNull());
    expect(popover()?.parentElement).toBe(dialog);
    dialog.remove();
  });

  it("a press elsewhere closes it, and leaves focus alone", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.pointerDown(screen.getByText("Elsewhere"));
    expect(onClose).toHaveBeenCalledWith("outside");
    expect(popover()).toBeNull();
  });

  it("a press on the popover or its control does not close it", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.pointerDown(screen.getByText("One"));
    fireEvent.pointerDown(screen.getByText("Open"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape closes it, returns focus to the control, and is not seen by anything else", async () => {
    const onClose = vi.fn();
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    render(<Harness onClose={onClose} />);
    screen.getByText("Two").focus();
    fireEvent.keyDown(screen.getByText("Two"), { key: "Escape" });
    document.removeEventListener("keydown", outer);
    expect(onClose).toHaveBeenCalledWith("escape");
    expect(document.activeElement).toBe(screen.getByText("Open"));
    expect(outer).not.toHaveBeenCalled();
  });

  it("Escape with focus somewhere else on the page is not its business", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    screen.getByText("Fallback").focus();
    fireEvent.keyDown(screen.getByText("Fallback"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("initialFocus: container focuses the panel; first focuses its first control; none leaves focus", async () => {
    const { unmount } = render(<Harness extra={{ initialFocus: "container", tabIndex: -1 }} />);
    await waitFor(() => expect(document.activeElement).toBe(popover()));
    unmount();

    const second = render(<Harness extra={{ initialFocus: "first" }} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText("One")));
    second.unmount();

    const third = render(<Harness startOpen={false} />);
    const trigger = screen.getByText("Open");
    await userEvent.click(trigger);
    expect(popover()).not.toBeNull();
    expect(document.activeElement).toBe(trigger);
    third.unmount();
  });

  it("Tab out closes it only when asked to (menus)", () => {
    const onClose = vi.fn();
    const { unmount } = render(<Harness onClose={onClose} />);
    screen.getByText("Two").focus();
    fireEvent.keyDown(screen.getByText("Two"), { key: "Tab" });
    expect(onClose).not.toHaveBeenCalled();
    unmount();

    render(<Harness onClose={onClose} extra={{ closeOnTab: true }} />);
    screen.getByText("Two").focus();
    fireEvent.keyDown(screen.getByText("Two"), { key: "Tab" });
    expect(onClose).toHaveBeenCalledWith("tab");
  });

  it("closes when a layout change puts its control away, moving focus that was inside to the fallback", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const trigger = screen.getByText("Open");
    screen.getByText("One").focus();
    // display: none - no boxes (happy-dom does not lay out, so say so).
    trigger.getClientRects = () => [] as unknown as DOMRectList;
    window.dispatchEvent(new Event("resize"));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith("trigger-lost"));
    expect(document.activeElement).toBe(screen.getByText("Fallback"));
  });

  it("closes when its control is put away even if focus was elsewhere - without moving focus", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const elsewhere = document.body.appendChild(document.createElement("input"));
    elsewhere.focus();
    screen.getByText("Open").getClientRects = () => [] as unknown as DOMRectList;
    window.dispatchEvent(new Event("resize"));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith("trigger-lost"));
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });
});
