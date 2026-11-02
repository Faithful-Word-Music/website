"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/components/ui/cn";

import { loadYouTubeApi, YT_STATE, type YouTubePlayerInstance } from "./youtube-api";

/** How long a recording may sit unstarted after being told to play before the browser is taken to have blocked it. */
const BLOCKED_AFTER_MS = 4000;

export interface PlayerCallbacks {
  onStarted?: () => void;
  onPaused?: () => void;
  onEnded?: () => void;
  onError?: () => void;
  onBlocked?: () => void;
}

/**
 * YouTube's own embedded player (youtube-nocookie.com), driven by the
 * playlist's state: which video, and whether it should be playing. It never
 * starts by itself - only after someone has pressed play somewhere on the
 * page. Events come back through the callbacks: started, paused, finished,
 * failed (private, removed, not embeddable), or blocked by the browser.
 *
 * `loadKey` changes whenever the same video should be loaded afresh (chosen
 * again after it failed or finished).
 */
export function YouTubePlayer({
  mediaId,
  playing,
  loadKey,
  title,
  className,
  ...callbacks
}: PlayerCallbacks & {
  mediaId: string | null;
  playing: boolean;
  loadKey: number;
  title: string;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YouTubePlayerInstance | null>(null);
  const loaded = useRef<string | null>(null);
  const blockedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const events = useRef(callbacks);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    events.current = callbacks;
  });

  // The player itself, made once.
  useEffect(() => {
    let cancelled = false;
    const element = host.current;
    if (!element) return;
    const target = document.createElement("div");
    element.appendChild(target);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        player.current = new YT.Player(target, {
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: window.location.origin },
          events: {
            onReady: () => {
              if (!cancelled) setReady(true);
            },
            onStateChange: ({ data }) => {
              if (data === YT_STATE.PLAYING) {
                clearTimeout(blockedTimer.current);
                events.current.onStarted?.();
              } else if (data === YT_STATE.PAUSED) {
                events.current.onPaused?.();
              } else if (data === YT_STATE.ENDED) {
                events.current.onEnded?.();
              }
            },
            onError: () => {
              clearTimeout(blockedTimer.current);
              events.current.onError?.();
            },
            onAutoplayBlocked: () => {
              clearTimeout(blockedTimer.current);
              events.current.onBlocked?.();
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      clearTimeout(blockedTimer.current);
      player.current?.destroy();
      player.current = null;
      loaded.current = null;
      element.replaceChildren();
    };
  }, []);

  // Which video.
  useEffect(() => {
    const instance = player.current;
    if (!ready || !instance) return;
    clearTimeout(blockedTimer.current);
    if (!mediaId) {
      if (loaded.current) instance.stopVideo();
      loaded.current = null;
      return;
    }
    loaded.current = mediaId;
    if (playing) {
      instance.loadVideoById(mediaId);
      blockedTimer.current = setTimeout(() => {
        const state = player.current?.getPlayerState();
        if (state === YT_STATE.UNSTARTED || state === YT_STATE.CUED) events.current.onBlocked?.();
      }, BLOCKED_AFTER_MS);
    } else {
      instance.cueVideoById(mediaId);
    }
    // `playing` is read here, not followed: pausing and resuming is the next effect's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, mediaId, loadKey]);

  // Whether it plays.
  useEffect(() => {
    const instance = player.current;
    if (!ready || !instance || !mediaId || loaded.current !== mediaId) return;
    const state = instance.getPlayerState();
    if (playing && state !== YT_STATE.PLAYING && state !== YT_STATE.BUFFERING) instance.playVideo();
    if (!playing && (state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING)) instance.pauseVideo();
  }, [ready, playing, mediaId]);

  // Never a failure loop: a player that could not load reports once.
  useEffect(() => {
    if (failed && mediaId) events.current.onError?.();
  }, [failed, mediaId]);

  return (
    <div className={cn("relative aspect-video w-full overflow-hidden rounded-lg bg-stage", className)}>
      <div ref={host} title={title} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />
    </div>
  );
}
