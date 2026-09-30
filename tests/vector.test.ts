import { describe, it, expect } from "vitest";
import { VECTOR_DIM, computeVector, computeTextVector, vectorToSql } from "@/lib/vector";
import { extractedToText, analysisToText } from "@/lib/storage";

describe("computeTextVector", () => {
  it("genera un vector de dimensión 64 con valores en [-1, 1]", () => {
    const vec = computeTextVector("FACTURA emisor total MXN");
    expect(vec).toHaveLength(VECTOR_DIM);
    expect(vec).toHaveLength(64);
    for (const v of vec) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("es determinista para el mismo texto", () => {
    const a = computeTextVector("factura de ejemplo");
    const b = computeTextVector("factura de ejemplo");
    expect(a).toEqual(b);
  });

  it("coincide con computeVector sobre los bytes UTF-8 del texto", () => {
    const text = "hola mundo 123";
    expect(computeTextVector(text)).toEqual(computeVector(Buffer.from(text, "utf8")));
  });

  it("produce embeddings distintos para textos distintos", () => {
    expect(computeTextVector("factura de venta")).not.toEqual(computeTextVector("nómina de empleado"));
  });

  it("vectorToSql serializa como array de pgvector", () => {
    const vec = [0.123456, -0.5, 1];
    expect(vectorToSql(vec)).toBe("[0.123456,-0.5,1]");
  });
});

describe("extractedToText", () => {
  it("devuelve texto vacío si no hay datos", () => {
    expect(extractedToText(null)).toBe("");
  });

  it("concatena campos ignorando vacíos", () => {
    const text = extractedToText({
      emisor: "Mi Empresa S.A.",
      receptor: "",
      rfc: "ABC123456XYZ",
      folio: "12345",
      total: 1160.5,
      moneda: "MXN",
      conceptos: ["Refrigerador — 12000", "Silla — 800"],
      otros: undefined,
    });
    expect(text).toContain("Mi Empresa S.A.");
    expect(text).toContain("ABC123456XYZ");
    expect(text).toContain("1160.5");
    expect(text).toContain("Refrigerador — 12000");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
    expect(text.split("\n")).toHaveLength(7);
  });

  it("analysisToText combina datos extraídos con texto crudo", () => {
    const text = analysisToText({ emisor: "A" }, "línea de OCR");
    expect(text).toContain("A");
    expect(text).toContain("línea de OCR");
    expect(analysisToText(null, "solo raw")).toBe("solo raw");
  });
});