import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";

export interface PreparedPage {
  image?: Buffer;
  text?: string;
}

const MAX_IMAGE_SIDE = 1600;
const MAX_OCR_PAGES = 10;
const RENDER_SCALE = 2;

export async function preparePages(
  data: Buffer,
  mimeType: string
): Promise<PreparedPage[]> {
  return mimeType === "application/pdf"
    ? renderPdfPages(data)
    : [{ image: await imageToJpeg(data) }];
}

async function imageToJpeg(data: Buffer): Promise<Buffer | undefined> {
  try {
    const img = await loadImage(data);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toBuffer("image/jpeg", 85);
  } catch {
    return undefined;
  }
}

async function renderPdfPages(data: Buffer): Promise<PreparedPage[]> {
  const pages: PreparedPage[] = [];
  try {
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(data),
      useSystemFonts: true,
    }).promise;

    const limit = Math.min(doc.numPages, MAX_OCR_PAGES);
    for (let i = 1; i <= limit; i++) {
      const page = await doc.getPage(i);
      const text = await extractPageText(page);

      let image: Buffer | undefined;
      try {
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = createCanvas(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height)
        );
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        image = canvas.toBuffer("image/jpeg", 80);
      } catch {
        image = undefined;
      }

      pages.push({ image, text });
    }
  } catch (err) {
    console.error("pdf render error", err);
  }
  return pages;
}

async function extractPageText(page: pdfjsLib.PDFPageProxy): Promise<string> {
  try {
    const content = await page.getTextContent();
    const items = content.items
      .filter((item) => typeof (item as { str?: unknown }).str === "string")
      .map((item) => {
        const t = item as unknown as { str: string; transform: number[] };
        return {
          str: t.str.trim(),
          x: Math.round(t.transform?.[4] ?? 0),
          y: Math.round(t.transform?.[5] ?? 0),
        };
      })
      .filter((i) => i.str.length > 0);

    const lines: { key: number; items: { x: number; str: string }[]; order: number }[] = [];
    for (const item of items) {
      let line = lines.find(
        (l) => Math.abs(l.key - item.y) <= 3
      );
      if (!line) {
        line = { key: item.y, items: [], order: lines.length };
        lines.push(line);
      }
      line.items.push({ x: item.x, str: item.str });
    }

    lines
      .sort((a, b) => a.order - b.order)
      .forEach((l) => l.items.sort((a, b) => a.x - b.x));

    return lines.map((l) => l.items.map((i) => i.str).join(" ")).join("\n");
  } catch {
    return "";
  }
}