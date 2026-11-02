/** 16px line icons for share menus (MenuItem.icon), as SVG paths. */
export const SHARE_MENU_ICONS = {
  text: "M3 4h10M3 7h10M3 10h6.5M3 13h4",
  picture:
    "M2.5 3.5h11a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5ZM2 10.5l3.2-3.2 2.8 2.8 1.8-1.8L14 12M10.5 6.25h.01",
  copy: "M5.5 5.5V3a1 1 0 0 1 1-1H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-2.5M3 5.5h6.5a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z",
  download: "M8 2v8M4.75 6.75 8 10l3.25-3.25M2.5 13.5h11",
  mail: "M2 4h12v8.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V4Zm0 0 6 5 6-5",
  more: "M4 8h.01M8 8h.01M12 8h.01",
} as const;

/** The familiar box with an arrow leaving it. */
export function ShareIcon() {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 10V1.75M5 4.5l3-3 3 3M5.5 7H4a1 1 0 0 0-1 1v5.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
