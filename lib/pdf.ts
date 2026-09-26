"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * The API runs every attachment through an OCR step that only understands
 * raster images, so a PDF posted as-is comes back as a 500 and the grievance
 * ends up with "registered" + "document not attached". Render the PDF onto a
 * canvas here and upload a PNG instead.
 */
const MAX_PAGES = 2;
const RENDER_SCALE = 2;

const IMAGE_TYPES = /^image\/(jpeg|png|webp)$/;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** Mirrors the MIME allow-list enforced by the upload endpoint. */
export function isSupportedUpload(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    IMAGE_TYPES.test(file.type) ||
    IMAGE_EXT.test(file.name) ||
    /\.pdf$/i.test(file.name)
  );
}

export function isTooLarge(file: File, maxBytes = 10 * 1024 * 1024): boolean {
  return file.size > maxBytes;
}

async function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas;
}

function stack(pages: HTMLCanvasElement[]): HTMLCanvasElement {
  if (pages.length === 1) return pages[0];
  const width = Math.max(...pages.map((p) => p.width));
  const height = pages.reduce((sum, p) => sum + p.height, 0);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("canvas-unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  let y = 0;
  for (const p of pages) {
    ctx.drawImage(p, 0, y);
    y += p.height;
  }
  return out;
}

function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("png-encode-failed"))),
      "image/png"
    );
  });
}

/** Converts a PDF to a PNG `File`; every other file type is returned as-is. */
export async function toUploadableFile(file: File): Promise<File> {
  if (!isPdf(file)) return file;

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const doc = await task.promise;

  try {
    const pages: HTMLCanvasElement[] = [];
    const count = Math.min(doc.numPages, MAX_PAGES);
    for (let n = 1; n <= count; n++) pages.push(await renderPage(doc, n));

    const blob = await toPngBlob(stack(pages));
    const base = file.name.replace(/\.pdf$/i, "") || "document";
    return new File([blob], `${base}.png`, {
      type: "image/png",
      lastModified: Date.now(),
    });
  } finally {
    await task.destroy().catch(() => {});
  }
}
