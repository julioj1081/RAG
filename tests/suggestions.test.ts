import { describe, expect, it } from "vitest";
import { buildSuggestions, type SuggestionFile } from "@/lib/suggestions";

const factura = (filename: string, overrides: Record<string, unknown> = {}): SuggestionFile => ({
  filename,
  doc_type: "factura",
  extracted: {
    emisor: "Mi Empresa S.A.",
    folio: "F-001",
    total: "1250.00",
    ...overrides,
  },
});

describe("buildSuggestions", () => {
  it("devuelve al menos 3 sugerencias sin documentos", () => {
    const out = buildSuggestions([], 3);
    expect(out.length).toBeGreaterThanOrEqual(3);
  });

  it("prioriza preguntas basadas en el total del documento más reciente", () => {
    const files = [factura("factura.pdf")];
    const out = buildSuggestions(files, 3);
    expect(out[0]).toContain("total");
    expect(out[0]).toContain("factura.pdf");
  });

  it("usa el folio cuando no hay total", () => {
    const files = [factura("recibo.pdf", { total: null, folio: "R-99" })];
    const out = buildSuggestions(files, 3);
    expect(out[0]).toContain("folio");
    expect(out[0]).toContain("R-99");
  });

  it("no repite sugerencias duplicadas", () => {
    const files = [
      factura("a.pdf", { total: "10" }),
      factura("b.pdf", { total: "10" }),
    ];
    const out = buildSuggestions(files, 3);
    expect(new Set(out).size).toBe(out.length);
  });

  it("genera una por cada documento reciente analizado (máx 3) más genéricas", () => {
    const files = [
      factura("a.pdf"),
      factura("b.pdf"),
      factura("c.pdf"),
      factura("d.pdf"),
    ];
    const out = buildSuggestions(files, 3);
    expect(out.filter((s) => s.includes(".pdf")).length).toBe(3);
  });

  it("incluye una sugerencia de búsqueda de texto con folio o RFC", () => {
    const files = [factura("factura.pdf", { total: null, folio: "F-001", rfc: "XAXX010101000" })];
    const out = buildSuggestions(files, 3);
    expect(out.some((s) => s.includes("aparece «F-001»"))).toBe(true);
  });

  it("ignora documentos sin extracción", () => {
    const files: SuggestionFile[] = [{ filename: "x.pdf", doc_type: null, extracted: null }];
    const out = buildSuggestions(files, 3);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.every((s) => !s.includes("x.pdf"))).toBe(true);
  });
});