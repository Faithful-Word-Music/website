"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Which month tab is open, shared between the schedule (SongListView, which
 * switches it) and the page header (PdfLink, which offers that month's PDF).
 */
const ActiveMonthContext = createContext<{
  activeIndex: number;
  setActiveIndex: (index: number) => void;
} | null>(null);

/** The tab opened on is chosen on the server, so the first render matches the HTML. */
export function ActiveMonthProvider({
  initialIndex,
  children,
}: {
  initialIndex: number;
  children: ReactNode;
}) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  return (
    <ActiveMonthContext value={{ activeIndex, setActiveIndex }}>{children}</ActiveMonthContext>
  );
}

export function useActiveMonth() {
  const value = useContext(ActiveMonthContext);
  if (!value) throw new Error("useActiveMonth() must be used inside <ActiveMonthProvider>.");
  return value;
}
