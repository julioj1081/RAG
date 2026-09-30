import { describe, it, expect } from "vitest";
import {
  MAX_UPLOAD_SIZE,
  isAllowedMime,
  validateContent,
} from "@/lib/validate";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const GIF = new TextEncoder().encode("GIF89a...");
const BMP = new TextEncoder().encode("BM...");
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

function pdf({ truncated = false, corrupt = false, empty = false } = {}): Uint8Array {
  if (empty) return new Uint8Array(0);
  if (corrupt) return new TextEncoder().encode("This is definitely not a PDF");
  const header = "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n";
  const eof = "\n%%EOF";
  return new TextEncoder().encode(header + (truncated ? "" : eof));
}

describe("isAllowedMime", () => {
  it("accepta formatos permitidos", () => {
    expect(isAllowedMime("application/pdf")).toBe(true);
    expect(isAllowedMime("image/png")).toBe(true);
    expect(isAllowedMime("image/jpeg")).toBe(true);
    expect(isAllowedMime("image/webp")).toBe(true);
    expect(isAllowedMime("image/gif")).toBe(true);
    expect(isAllowedMime("image/bmp")).toBe(true);
    expect(isAllowedMime("image/svg+xml")).toBe(true);
  });

  it("rechaza formatos no permitidos", () => {
    expect(isAllowedMime("text/plain")).toBe(false);
    expect(isAllowedMime("video/mp4")).toBe(false);
    expect(isAllowedMime("application/zip")).toBe(false);
    expect(isAllowedMime("image/tiff")).toBe(false);
    expect(isAllowedMime("")).toBe(false);
    expect(isAllowedMime("application/pdf; charset=utf-8")).toBe(false);
  });
});

describe("validateContent — PDF", () => {
  it("acepta un PDF válido", () => {
    expect(validateContent("application/pdf", pdf())).toBe(true);
  });

  it("acepta un PDF cuya cabecera no está al inicio (por trailing whitespace)", () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\n...\n%%EOF\n");
    expect(validateContent("application/pdf", bytes)).toBe(true);
  });

  it("rechaza un PDF corrupto (no empieza con %PDF-)", () => {
    expect(validateContent("application/pdf", pdf({ corrupt: true }))).toBe(false);
  });

  it("rechaza un PDF incompleto/truncado (sin marcador %%EOF)", () => {
    expect(validateContent("application/pdf", pdf({ truncated: true }))).toBe(false);
  });

  it("rechaza un PDF vacío", () => {
    expect(validateContent("application/pdf", pdf({ empty: true }))).toBe(false);
  });

  it("rechaza bytes de una imagen etiquetados como PDF", () => {
    expect(validateContent("application/pdf", PNG)).toBe(false);
  });
});

describe("validateContent — imágenes", () => {
  it("acepta PNG con su firma", () => {
    expect(validateContent("image/png", PNG)).toBe(true);
  });

  it("rechaza PNG con firma incorrecta", () => {
    expect(validateContent("image/png", JPEG)).toBe(false);
    expect(validateContent("image/png", new TextEncoder().encode("<svg></svg>"))).toBe(false);
  });

  it("acepta JPEG con su firma", () => {
    expect(validateContent("image/jpeg", JPEG)).toBe(true);
  });

  it("rechaza JPEG con firma incorrecta", () => {
    expect(validateContent("image/jpeg", new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it("acepta GIF con su firma", () => {
    expect(validateContent("image/gif", GIF)).toBe(true);
  });

  it("acepta BMP con su firma", () => {
    expect(validateContent("image/bmp", BMP)).toBe(true);
  });

  it("acepta SVG con etiqueta <svg>", () => {
    expect(validateContent("image/svg+xml", SVG)).toBe(true);
  });

  it("rechaza SVG sin contenido XML/SVG", () => {
    expect(validateContent("image/svg+xml", new TextEncoder().encode("plain text"))).toBe(false);
  });

  it("acepta WEBP solo con cabecera RIFF...WEBP", () => {
    const webp = new TextEncoder().encode("RIFF....WEBPVP8 ");
    expect(validateContent("image/webp", webp)).toBe(true);
  });

  it("rechaza WEBP con cabecera incompleta", () => {
    const webp = new TextEncoder().encode("RIFF....XXXX");
    expect(validateContent("image/webp", webp)).toBe(false);
  });

  it("rechaza cualquier archivo vacío", () => {
    expect(validateContent("image/png", new Uint8Array(0))).toBe(false);
    expect(validateContent("image/jpeg", new Uint8Array(0))).toBe(false);
  });
});

describe("MAX_UPLOAD_SIZE", () => {
  it("el límite es de 25 MB", () => {
    expect(MAX_UPLOAD_SIZE).toBe(25 * 1024 * 1024);
  });
});