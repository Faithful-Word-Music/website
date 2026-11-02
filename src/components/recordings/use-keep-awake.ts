"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  browserWakeLockEnvironment,
  readKeepAwake,
  WakeLockController,
  writeKeepAwake,
  type WakeLockStatus,
} from "@/lib/recordings/wake-lock";

/*
 * The Keep Screen Awake setting is remembered on this device (localStorage,
 * like the install card's dismissal) - on unless turned off here. Storage may
 * be unavailable (private browsing): then it is simply on for the page.
 */
const CHANGE_EVENT = "fwm:keep-screen-awake";

/** The choice for this page when storage could not keep it. */
let unsaved: boolean | null = null;

function snapshot(): boolean {
  return unsaved ?? readKeepAwake(storage());
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Keeps the screen awake while `playing` and the setting is on, through the
 * Screen Wake Lock API (src/lib/recordings/wake-lock.ts). Nothing happens on
 * the server, and nothing is asked for until playback actually starts.
 */
export function useKeepAwake(playing: boolean) {
  const enabled = useSyncExternalStore(subscribe, snapshot, () => true);
  const [status, setStatus] = useState<WakeLockStatus>("idle");
  // Read from the browser itself, so "can't keep the screen on" shows before anything plays.
  const supported = useSyncExternalStore(noSubscription, () => "wakeLock" in navigator, () => true);
  const controller = useRef<WakeLockController | null>(null);

  useEffect(() => {
    const env = browserWakeLockEnvironment();
    if (!env) return;
    const made = new WakeLockController(env, setStatus);
    controller.current = made;
    return () => {
      made.dispose();
      controller.current = null;
    };
  }, []);

  useEffect(() => {
    controller.current?.setWanted(playing && enabled);
  }, [playing, enabled]);

  const setEnabled = useCallback((on: boolean) => {
    writeKeepAwake(storage(), on);
    unsaved = readKeepAwake(storage()) === on ? null : on;
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { enabled, setEnabled, status: supported ? status : ("unsupported" as const) };
}

function noSubscription() {
  return () => {};
}
