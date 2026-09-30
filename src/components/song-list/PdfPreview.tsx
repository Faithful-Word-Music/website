"use client";

import type { PDFDocumentLoadingTask, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/components/ui/cn";
import { songListContent } from "@/content/song-list";

const { sheetMusic: copy } = songListContent.songPage;

/** A hymn is a page or two; this only guards against an unexpectedly long file. */
const MAX_PAGES = 12;

/** Widest a sheet is drawn, so a page stays a comfortable height on big screens. */
const MAX_SHEET_WIDTH = 680;

/** Sharp on high-density screens without drawing enormous canvases on phones. */
const MAX_PIXEL_RATIO = 2;

/** Space around each sheet and between sheets, in CSS pixels (matches p-3 / sm:p-5 below). */
const gutter = () => (window.matchMedia("(min-width: 640px)").matches ? 20 : 12);

type Status = "loading" | "ready" | "error";

/**
 * PDF.js is loaded only when a preview is on the page, and its worker only
 * once per visit, however many songs are opened.
 */
async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(
    new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
    { type: "module" },
  );
  return pdfjs;
}

const labelClasses = "font-sans text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted sm:text-[0.7rem]";

/**
 * The sheet music, drawn right in the page with PDF.js (Mozilla's PDF
 * renderer) so it looks the same on every phone and computer. A browser's own
 * viewer inside a frame does not: Android shows nothing, and an iPhone shows
 * a stuck first page.
 *
 * The viewer is exactly one page tall. Later pages are reached by scrolling
 * inside it - freely, with no snapping, which felt jumpy on wheels and
 * trackpads - and the header counts the page that fills most of the view.
 * The pages are not links: the View PDF button below opens the file.
 * If anything fails, the viewer steps aside with a short note; the View PDF
 * button in the list below still works.
 */
export function PdfPreview({ src, title, label }: { src: string; title: string; label: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  /** Distance from the top of one page to the next, for the page count. */
  const strideRef = useRef(0);
  const [status, setStatus] = useState<Status>("loading");
  const [pageCount, setPageCount] = useState(0);
  const [current, setCurrent] = useState(1);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const holder = pagesRef.current;
    if (!scroller || !holder) return;

    let cancelled = false;
    let loading: PDFDocumentLoadingTask | null = null;
    let pages: PDFPageProxy[] = [];
    let tasks: RenderTask[] = [];
    let drawnWidth = 0;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;

    async function draw() {
      const space = gutter();
      const width = Math.min(scroller!.clientWidth - space * 2, MAX_SHEET_WIDTH);
      if (cancelled || width <= 0 || width === drawnWidth) return;
      drawnWidth = width;

      for (const task of tasks) task.cancel();
      tasks = [];
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

      const drawn = pages.map((page) => {
        const natural = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (width / natural.width) * ratio });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.className = "block h-auto w-full rounded-sm bg-white shadow-card";
        const task = page.render({ canvas, viewport });
        tasks.push(task);
        return { canvas, cssHeight: (natural.height / natural.width) * width, done: task.promise };
      });

      try {
        await Promise.all(drawn.map(({ done }) => done));
      } catch (error) {
        // A newer draw cancelled this one; it will finish the job.
        if (error instanceof Error && error.name === "RenderingCancelledException") return;
        throw error;
      }
      if (cancelled) return;

      holder!.replaceChildren(...drawn.map(({ canvas }) => canvas));
      const first = drawn[0]?.cssHeight ?? 0;
      strideRef.current = first + space;
      setHeight(Math.round(first + space * 2));
      setStatus("ready");
    }

    function fail(error: unknown) {
      if (cancelled) return;
      console.error("[sheet-music] The PDF preview could not be drawn:", error instanceof Error ? error.message : error);
      setStatus("error");
    }

    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => void draw().catch(fail), 150);
    });

    (async () => {
      const pdfjs = await loadPdfJs();
      loading = pdfjs.getDocument({ url: src });
      const document = await loading.promise;
      if (cancelled) return;
      const count = Math.min(document.numPages, MAX_PAGES);
      pages = await Promise.all(Array.from({ length: count }, (_, index) => document.getPage(index + 1)));
      if (cancelled) return;
      setPageCount(count);
      await draw();
      observer.observe(scroller);
    })().catch(fail);

    return () => {
      cancelled = true;
      clearTimeout(resizeTimer);
      observer.disconnect();
      for (const task of tasks) task.cancel();
      // Stops a download still in progress and frees the document.
      void loading?.destroy();
    };
  }, [src]);

  if (status === "error") {
    return <p className="mt-4 text-sm text-muted">{copy.previewError}</p>;
  }

  const onScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller || strideRef.current === 0) return;
    // The page under the middle of the view is the one being read.
    const middle = scroller.scrollTop + scroller.clientHeight / 2;
    setCurrent(Math.min(pageCount, Math.floor(middle / strideRef.current) + 1));
  };

  return (
    <figure className="mt-4 overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <figcaption className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-5 py-2 sm:px-6">
        <span className={cn(labelClasses, "min-w-0 truncate")}>{label}</span>
        {pageCount > 1 ? (
          <span className="tnum shrink-0 text-sm text-muted" aria-live="polite">
            {copy.pageOf.replace("{page}", String(current)).replace("{count}", String(pageCount))}
          </span>
        ) : null}
      </figcaption>

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        role="region"
        aria-label={copy.previewTitle.replace("{title}", title)}
        tabIndex={0}
        style={height ? { height } : undefined}
        className={cn(
          "overscroll-contain bg-paper outline-none focus-visible:ring-2 focus-visible:ring-gold",
          pageCount > 1 ? "overflow-y-auto" : "overflow-hidden",
        )}
      >
        {status === "loading" ? (
          <div className="mx-auto max-w-[calc(680px+2.5rem)] p-3 sm:p-5">
            <div className="flex aspect-[8.5/11] w-full items-center justify-center rounded-sm bg-white text-sm text-neutral-500 shadow-card">
              <span className="animate-pulse">{copy.previewLoading}</span>
            </div>
          </div>
        ) : null}
        {/* Pages are drawn into here once PDF.js has them. */}
        <div
          ref={pagesRef}
          aria-hidden="true"
          className={status === "loading" ? "h-0 overflow-hidden" : "mx-auto flex max-w-[calc(680px+2.5rem)] flex-col gap-3 p-3 sm:gap-5 sm:p-5"}
        />
      </div>
    </figure>
  );
}
