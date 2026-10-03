"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { ServiceSheetMusic } from "@/components/dashboard/ServiceSheetMusic";
import { cn } from "@/components/ui/cn";
import { dashboardContent } from "@/content/dashboard";
import type { ServicePacket } from "@/lib/dashboard/coming-up";

/**
 * "Sheet music for this service" on the song list's cards - the same button
 * (and PDF) the Dashboard's Coming up offers, for every published service.
 *
 * The song list is static and the same for everyone, so the signed-in
 * person's own sheet music is asked for once the page has loaded
 * (/api/account/sheet-music), once for the whole page. Visitors, and people
 * with no sheet music types assigned, see nothing here; for everyone else a
 * service with none of their sheet music says so, quietly.
 *
 * So the buttons are there at once rather than after a round trip, the last
 * answer is kept for the tab (sessionStorage, with whose it is) and shown
 * straight away - from before Clerk has even finished loading - while a fresh
 * one is fetched. A stored answer for anyone else is never shown.
 */

type Packets = { assigned: false } | { assigned: true; packets: Record<string, ServicePacket | null> };
type Stored = { userId: string; packets: Packets };

const STORAGE_KEY = "fwm:service-packets";
const CHANGED = "fwm:service-packets-changed";

function readRaw(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function parseStored(raw: string): Stored | null {
  try {
    const value = JSON.parse(raw || "null") as Stored | null;
    return value && typeof value.userId === "string" && value.packets ? value : null;
  } catch {
    return null;
  }
}

function writeStored(value: Stored | null) {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: nothing is remembered, and the buttons stay hidden.
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

function parse(data: unknown): Packets | null {
  const value = data as { assigned?: unknown; packets?: unknown } | null;
  if (!value) return null;
  if (value.assigned === false) return { assigned: false };
  if (value.packets && typeof value.packets === "object") {
    return { assigned: true, packets: value.packets as Record<string, ServicePacket | null> };
  }
  return null;
}

const PacketsContext = createContext<Packets | null>(null);

export function ServicePacketsProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAccount();
  // The last answer, at once (the server, which cannot know, renders none).
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const state = useMemo(() => parseStored(raw), [raw]);

  // Then a fresh one, as soon as the session is known.
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !userId) {
      if (readRaw()) writeStored(null);
      return;
    }
    const controller = new AbortController();
    // No cache option: a "no-store" request would make the server skip its own cached Index read.
    fetch("/api/account/sheet-music", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        const packets = parse(data);
        if (!packets) return;
        writeStored({ userId, packets });
      })
      .catch(() => {
        // Offline or aborted: whatever was shown stays.
      });
    return () => controller.abort();
  }, [isLoaded, isSignedIn, userId]);

  // Before Clerk has loaded, the stored answer is shown on trust; after, only if it is this person's.
  const packets = state && (!isLoaded || (isSignedIn && state.userId === userId)) ? state.packets : null;
  return <PacketsContext.Provider value={packets}>{children}</PacketsContext.Provider>;
}

/** One card's sheet music: the button, a quiet "none" line, or nothing (visitors, no types, still loading). */
export function ServicePacketSlot({
  serviceId,
  label,
  className,
}: {
  serviceId: string;
  /** Names the service in the printing help, e.g. "Sunday · Morning Service · October 4". */
  label: string;
  className?: string;
}) {
  const packets = useContext(PacketsContext);
  if (!packets || !packets.assigned || !(serviceId in packets.packets)) return null;
  const packet = packets.packets[serviceId];

  return (
    <div className={cn("mt-auto pt-5", className)}>
      {packet ? (
        <ServiceSheetMusic href={packet.href} songs={packet.songs} showLabels={packet.showLabels} label={label} />
      ) : (
        <NoServiceSheetMusic />
      )}
    </div>
  );
}

/** In place of the button, when none of the service's songs has the person's sheet music. */
export function NoServiceSheetMusic() {
  return (
    <p className="flex min-h-14 items-center justify-center rounded-xl border border-dashed border-line px-4 text-center text-sm text-muted">
      {dashboardContent.comingUp.packet.none}
    </p>
  );
}
