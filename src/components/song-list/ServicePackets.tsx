"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { ServiceSheetMusic, SheetTypeMenu } from "@/components/dashboard/ServiceSheetMusic";
import { cn } from "@/components/ui/cn";
import { dashboardContent } from "@/content/dashboard";
import type { PacketTypeOption, ServicePacket } from "@/lib/dashboard/coming-up";
import { PACKETS_ATTRIBUTE, PACKETS_STORAGE_KEY } from "@/lib/service-packets";

/**
 * "Sheet music for this service" on the song list's cards - the same button
 * (and PDF) the Dashboard's Coming up offers, for every published service.
 *
 * The song list is static and the same for everyone, so the signed-in
 * person's own sheet music cannot come with the page. It is remembered in
 * this browser instead (src/lib/service-packets.ts): the last answer, with
 * whose it is, is shown the moment the page renders - from before Clerk has
 * even finished loading - while a fresh one is fetched once for the whole
 * page (/api/account/sheet-music). The Dashboard hands over its own answer as
 * well (ServicePacketsSeed), so the song list opened from it is complete at
 * once. A stored answer for anyone else is never shown.
 *
 * Visitors, and people with no sheet music types assigned, see nothing here;
 * for everyone else a service with none of their sheet music says so, quietly.
 *
 * Someone who looks after the sheet music (manage_sheet_music) also gets
 * `types`: every type each service can be printed in, offered from three dots
 * beside the button - or on their own, when they have no types themselves.
 */

/** Every sheet music type each service can be printed in, by service id. */
type PacketTypes = Record<string, PacketTypeOption[]>;

export type Packets =
  | { assigned: false; types?: PacketTypes }
  | { assigned: true; packets: Record<string, ServicePacket | null>; types?: PacketTypes };
type Stored = { userId: string; packets: Packets };

const CHANGED = "fwm:service-packets-changed";

function readRaw(): string {
  try {
    return localStorage.getItem(PACKETS_STORAGE_KEY) ?? "";
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
  const raw = value ? JSON.stringify(value) : "";
  if (readRaw() === raw) return;
  try {
    if (value) localStorage.setItem(PACKETS_STORAGE_KEY, raw);
    else localStorage.removeItem(PACKETS_STORAGE_KEY);
  } catch {
    // Storage blocked: nothing is remembered, and the buttons wait for the fetch.
  }
  // Keep the <head> script's reserved space in step (see .packet-slot in globals.css).
  document.documentElement.toggleAttribute(PACKETS_ATTRIBUTE, value?.packets.assigned === true);
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  // Another tab (or the app) signed in, out or fetched.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function parse(data: unknown): Packets | null {
  const value = data as { assigned?: unknown; packets?: unknown; types?: unknown } | null;
  if (!value) return null;
  const types = value.types && typeof value.types === "object" ? { types: value.types as PacketTypes } : {};
  if (value.assigned === false) return { assigned: false, ...types };
  if (value.packets && typeof value.packets === "object") {
    return { assigned: true, packets: value.packets as Record<string, ServicePacket | null>, ...types };
  }
  return null;
}

/** On the Dashboard: remembers the answer it has just worked out, for the song list. Renders nothing. */
export function ServicePacketsSeed({ userId, packets }: { userId: string; packets: Packets }) {
  useEffect(() => {
    writeStored({ userId, packets });
  }, [userId, packets]);
  return null;
}

const PacketsContext = createContext<Packets | null>(null);

/** For the placeholder's "5 songs · PDF" line: a typical service. */
const PLACEHOLDER_SONGS = Array.from({ length: 5 }, () => ({ number: null, title: "", label: "" }));

export function ServicePacketsProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAccount();
  // The last answer, at once (the server, which cannot know, renders none).
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const state = useMemo(() => parseStored(raw), [raw]);

  // Then a fresh one, as soon as the session is known.
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !userId) {
      writeStored(null);
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

/**
 * One card's sheet music: the button, a quiet "none" line, or nothing
 * (visitors, no types). While the answer is not known yet it is a
 * .packet-slot: an invisible copy of the button, so it takes exactly the
 * button's height at this width - shown only when this browser expects a
 * button (globals.css), so the card does not grow when it arrives.
 */
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
  if (!packets) {
    return (
      <div aria-hidden="true" className={cn("packet-slot invisible mt-auto pt-5", className)}>
        <ServiceSheetMusic href="#" songs={PLACEHOLDER_SONGS} showLabels={false} label={label} />
      </div>
    );
  }
  const types = packets.types?.[serviceId] ?? [];
  if (!packets.assigned) {
    // No types of their own, but they print for others: the types alone.
    return types.length > 0 ? (
      <div className={cn("mt-auto pt-5", className)}>
        <NoServiceSheetMusic types={types} own={false} />
      </div>
    ) : null;
  }
  if (!(serviceId in packets.packets)) return null;
  const packet = packets.packets[serviceId];

  return (
    <div className={cn("mt-auto pt-5", className)}>
      {packet ? (
        <ServiceSheetMusic href={packet.href} songs={packet.songs} showLabels={packet.showLabels} label={label} types={types} />
      ) : (
        <NoServiceSheetMusic types={types} />
      )}
    </div>
  );
}

/**
 * In place of the button, when none of the service's songs has the person's
 * sheet music - with the three dots still there for someone who prints for
 * others (`types`). `own={false}`: they have no types of their own at all, so
 * it names what the dots offer instead of saying theirs is missing.
 */
export function NoServiceSheetMusic({ types = [], own = true }: { types?: PacketTypeOption[]; own?: boolean }) {
  const copy = dashboardContent.comingUp.packet;
  return (
    <div className="flex min-h-14 items-stretch overflow-hidden rounded-xl border border-dashed border-line">
      <p className="flex min-w-0 flex-1 items-center justify-center px-4 text-center text-sm text-muted">
        {own ? copy.none : copy.types.only}
      </p>
      {types.length > 0 ? (
        <>
          <span aria-hidden="true" className="my-2.5 w-px shrink-0 bg-line" />
          <SheetTypeMenu types={types} className="w-12 hover:bg-paper" />
        </>
      ) : null}
    </div>
  );
}
