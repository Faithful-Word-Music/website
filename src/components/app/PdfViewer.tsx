"use client";

import type { PDFDocumentLoadingTask, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useId, useRef, useState } from "react";

import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { loadPdfJs } from "@/components/ui/pdfjs";
import { useScrollLock } from "@/components/ui/use-scroll-lock";
import { appContent } from "@/content/app";
import { isIosDevice } from "@/lib/install";
import { fileNameFromDisposition } from "@/lib/installed-app";

const copy = appContent.pdfViewer;

/** Sharp on high-density screens without drawing enormous canvases on phones. */
const MAX_PIXEL_RATIO = 2;

type Status = "loading" | "ready" | "error";

/** A failure with a message for the person, rather than a generic one. */
class ViewerError extends Error {}

/** The file's name when the response does not give one: the last part of its address. */
function fallbackName(href: string): string {
  const last = decodeURIComponent(href.split("?")[0].split("/").pop() || "document");
  return /\.pdf$/i.test(last) ? last : `${last}.pdf`;
}

/**
 * The installed app's PDF viewer (src/lib/installed-app.ts): the whole
 * screen, with Close, the file's name, and Save or share. A browser would
 * give a PDF these controls; the installed app on a phone does not.
 *
 * The file is fetched once and kept: PDF.js draws it and the same bytes are
 * shared or downloaded, so saving never fetches it again. Pages are drawn
 * only when near the view and let go when far from it, so a long service
 * packet does not exhaust an older phone's memory.
 */
export function PdfViewer({ href, onClose }: { href: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<PDFPageProxy[]>([]);
  const headingId = useId();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string>(copy.errors.generic);
  const [file, setFile] = useState<File | null>(null);
  /** Each page's height as a share of its width, so the slots are the right size before drawing. */
  const [shapes, setShapes] = useState<number[]>([]);
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useScrollLock(true);

  // A modal <dialog>: focus stays inside, Escape closes, and focus goes back
  // to the link afterwards.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);

  // Fetch the file and open it.
  useEffect(() => {
    let cancelled = false;
    let loading: PDFDocumentLoadingTask | null = null;
    const controller = new AbortController();

    (async () => {
      const response = await fetch(href, { signal: controller.signal, credentials: "same-origin" });
      if (!response.ok) {
        throw new ViewerError(
          response.status === 401
            ? copy.errors.signIn
            : response.status === 403
              ? copy.errors.restricted
              : copy.errors.generic,
        );
      }
      const buffer = await response.arrayBuffer();
      if (cancelled) return;
      const name = fileNameFromDisposition(response.headers.get("content-disposition")) ?? fallbackName(href);
      // The File copies the bytes, so PDF.js may take the buffer for its worker.
      setFile(new File([buffer], name, { type: "application/pdf" }));

      const pdfjs = await loadPdfJs();
      loading = pdfjs.getDocument({ data: new Uint8Array(buffer) });
      const pdf = await loading.promise;
      if (cancelled) return;
      const pages = await Promise.all(Array.from({ length: pdf.numPages }, (_, index) => pdf.getPage(index + 1)));
      if (cancelled) return;
      pagesRef.current = pages;
      setShapes(
        pages.map((page) => {
          const { width, height } = page.getViewport({ scale: 1 });
          return height / width;
        }),
      );
      setStatus("ready");
    })().catch((error: unknown) => {
      if (cancelled) return;
      console.error("[pdf-viewer] The PDF could not be opened:", error instanceof Error ? error.message : error);
      setErrorMessage(error instanceof ViewerError ? error.message : copy.errors.generic);
      setStatus("error");
    });

    return () => {
      cancelled = true;
      controller.abort();
      void loading?.destroy();
    };
  }, [href]);

  // Draw the pages near the view; let go of those far from it.
  useEffect(() => {
    if (status !== "ready") return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const slots = Array.from(scroller.querySelectorAll<HTMLElement>("[data-page]"));
    const tasks = new Map<number, RenderTask>();
    const drawn = new Set<number>();

    function clear(index: number) {
      tasks.get(index)?.cancel();
      tasks.delete(index);
      drawn.delete(index);
      slots[index]?.replaceChildren();
    }

    function draw(index: number) {
      const page = pagesRef.current[index];
      const slot = slots[index];
      if (!page || !slot || drawn.has(index) || slot.clientWidth === 0) return;
      drawn.add(index);

      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (slot.clientWidth / natural.width) * ratio });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.className = "block h-full w-full";

      const task = page.render({ canvas, viewport });
      tasks.set(index, task);
      task.promise
        .then(() => {
          if (tasks.get(index) !== task) return;
          tasks.delete(index);
          slot.replaceChildren(canvas);
        })
        .catch((error: unknown) => {
          drawn.delete(index);
          if (error instanceof Error && error.name === "RenderingCancelledException") return;
          console.error("[pdf-viewer] A page could not be drawn:", error instanceof Error ? error.message : error);
        });
    }

    const visibility = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) draw(index);
          else clear(index);
        }
      },
      { root: scroller, rootMargin: "150% 0px" },
    );
    for (const slot of slots) visibility.observe(slot);

    // Turning the phone redraws at the new width.
    let width = slots[0]?.clientWidth ?? 0;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const resize = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const next = slots[0]?.clientWidth ?? 0;
        if (next === width) return;
        width = next;
        for (const index of [...drawn]) clear(index);
        for (const slot of slots) {
          visibility.unobserve(slot);
          visibility.observe(slot);
        }
      }, 150);
    });
    resize.observe(scroller);

    return () => {
      clearTimeout(resizeTimer);
      visibility.disconnect();
      resize.disconnect();
      for (const task of tasks.values()) task.cancel();
    };
  }, [status]);

  const ios = isIosDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  const canShare = file !== null && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: file.name });
    } catch (error) {
      // Closing the share sheet is not a failure.
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("[pdf-viewer] Sharing failed:", error instanceof Error ? error.message : error);
    }
  }

  function download() {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const title = file ? file.name.replace(/\.pdf$/i, "") : copy.fallbackTitle;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-paper p-0 text-ink"
    >
      <div className="flex h-full flex-col">
        <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-2 sm:px-4">
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-paper hover:text-ink"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <h2 id={headingId} className="min-w-0 flex-1 truncate text-base font-medium text-ink">
            {title}
          </h2>
          {ios ? (
            canShare ? (
              <button type="button" onClick={() => void share()} className={buttonClasses("primary", "md", "shrink-0 px-4")}>
                <ShareIcon />
                {copy.saveOrShare}
              </button>
            ) : (
              <button type="button" onClick={download} disabled={!file} className={buttonClasses("primary", "md", "shrink-0 px-4")}>
                <DownloadIcon />
                {copy.download}
              </button>
            )
          ) : (
            <>
              {canShare ? (
                <button
                  type="button"
                  onClick={() => void share()}
                  aria-label={copy.share}
                  className={buttonClasses("secondary", "md", "shrink-0 px-3 sm:px-4")}
                >
                  <ShareIcon />
                  <span className="hidden sm:inline">{copy.share}</span>
                </button>
              ) : null}
              <button type="button" onClick={download} disabled={!file} className={buttonClasses("primary", "md", "shrink-0 px-4")}>
                <DownloadIcon />
                {copy.download}
              </button>
            </>
          )}
        </header>

        <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {status === "loading" ? (
            <p className="flex h-full items-center justify-center p-6 text-sm text-muted">
              <span className="animate-pulse">{copy.loading}</span>
            </p>
          ) : null}
          {status === "error" ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="max-w-sm text-ink-soft">{errorMessage}</p>
              <button type="button" onClick={onClose} className={buttonClasses("secondary")}>
                {copy.close}
              </button>
            </div>
          ) : null}
          {status === "ready" ? (
            <div className="mx-auto flex max-w-3xl flex-col gap-3 p-3 sm:gap-5 sm:p-5">
              {shapes.map((shape, index) => (
                <div
                  key={index}
                  data-page={index}
                  role="img"
                  aria-label={copy.pageLabel
                    .replace("{page}", String(index + 1))
                    .replace("{count}", String(shapes.length))}
                  style={{ aspectRatio: `1 / ${shape}` }}
                  className={cn("w-full overflow-hidden rounded-sm bg-white shadow-card")}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

function ShareIcon() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 10V1.75M5 4.5 8 1.5l3 3M5.5 7H4a1 1 0 0 0-1 1v5.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
