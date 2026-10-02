/**
 * PDF.js (Mozilla's PDF renderer), loaded only when a PDF is about to be
 * drawn, and its worker only once per visit however many PDFs are opened.
 * Shared by the song pages' preview (PdfPreview) and the installed app's
 * viewer (PdfViewer).
 */
export async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(
    new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
    { type: "module" },
  );
  return pdfjs;
}
