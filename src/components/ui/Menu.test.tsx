// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Menu, type MenuItem } from "./Menu";

afterEach(cleanup);

const items: MenuItem[] = [
  { key: "a", label: "Copy link" },
  { key: "b", label: "Disabled", disabled: true },
  { key: "c", label: "Email", href: "mailto:x@example.com" },
];

/** As ShareButton and ActionMenu use it: the caller refocuses its button when asked. */
function Harness({ onSelect = () => {} }: { onSelect?: (item: MenuItem) => void }) {
  const [open, setOpen] = useState(true);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  function close({ refocus = false } = {}) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }
  return (
    <div>
      <button ref={triggerRef} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls="menu">
        Share
      </button>
      <p>Elsewhere</p>
      {open ? <Menu id="menu" menuRef={menuRef} triggerRef={triggerRef} placement="below" items={items} onSelect={onSelect} onClose={close} /> : null}
    </div>
  );
}

const menuItems = () => screen.getAllByRole("menuitem");

describe("Menu (on the shared popover mechanics)", () => {
  it("is a role=menu portalled to <body>, focusing its first item", async () => {
    render(<Harness />);
    const menu = await screen.findByRole("menu");
    expect(menu.parentElement).toBe(document.body);
    await waitFor(() => expect(document.activeElement).toBe(menuItems()[0]));
  });

  it("arrows wrap, Home/End jump; a disabled item still takes focus", async () => {
    render(<Harness />);
    const menu = await screen.findByRole("menu");
    await waitFor(() => expect(document.activeElement).toBe(menuItems()[0]));
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(menuItems()[1]);
    expect(menuItems()[1].getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(menuItems()[0]);
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(menuItems()[2]);
    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(menuItems()[0]);
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(menuItems()[2]);
  });

  it("Escape closes it and focus goes back to the button", async () => {
    render(<Harness />);
    await screen.findByRole("menu");
    await waitFor(() => expect(document.activeElement).toBe(menuItems()[0]));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByText("Share"));
  });

  it("Tab closes it without pulling focus back", async () => {
    render(<Harness />);
    await screen.findByRole("menu");
    await waitFor(() => expect(document.activeElement).toBe(menuItems()[0]));
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("a press elsewhere closes it", async () => {
    render(<Harness />);
    await screen.findByRole("menu");
    fireEvent.pointerDown(screen.getByText("Elsewhere"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("choosing an item reports it; a disabled one does nothing", async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await screen.findByRole("menu");
    fireEvent.click(menuItems()[1]);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(menuItems()[0]);
    expect(onSelect).toHaveBeenCalledWith(items[0]);
  });

  it("goes into an open dialog its button is in", async () => {
    const dialog = document.body.appendChild(document.createElement("dialog"));
    dialog.setAttribute("open", "");
    render(<Harness />, { container: dialog.appendChild(document.createElement("div")) });
    const menu = await screen.findByRole("menu");
    expect(menu.parentElement).toBe(dialog);
    dialog.remove();
  });
});
