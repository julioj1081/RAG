import { describe, it, expect } from "vitest";
import { parseTextFields } from "@/lib/textfields";

describe("parseTextFields", () => {
  it("devuelve valores por defecto ante entrada vacía", () => {
    const data = parseTextFields("");
    expect(data).toMatchObject({
      emisor: "",
      receptor: "",
      rfc: "",
      fecha: "",
      folio: "",
      conceptos: [],
      subtotal: null,
      impuestos: null,
      total: null,
      moneda: "",
      otros: [],
    });
  });

  it("extrae emisor, receptor, rfc, fecha, folio y moneda", () => {
    const raw = [
      "FACTURA",
      "Emisor: Mi Empresa S.A. de C.V.",
      "Receptor: Cliente X",
      "RFC: ABC123456XYZ",
      "Fecha: 12/05/2024",
      "Folio: 12345",
      "Moneda: MXN",
    ].join("\n");

    const data = parseTextFields(raw);
    expect(data.emisor).toBe("Mi Empresa S.A. de C.V.");
    expect(data.receptor).toBe("Cliente X");
    expect(data.rfc).toBe("ABC123456XYZ");
    expect(data.fecha).toBe("12/05/2024");
    expect(data.folio).toBe("12345");
    expect(data.moneda).toBe("MXN");
  });

  it("extrae importes numéricos (subtotal, impuestos, total)", () => {
    const raw = [
      "Subtotal: $1,000.50",
      "IVA: $160.00",
      "Total: $1,160.50",
    ].join("\n");

    const data = parseTextFields(raw);
    expect(data.subtotal).toBeCloseTo(1000.5);
    expect(data.impuestos).toBeCloseTo(160);
    expect(data.total).toBeCloseTo(1160.5);
  });

  it("detecta conceptos con importe al final", () => {
    const raw = ["Refrigerador 12,000.00", "Silla de oficina 800.50"].join("\n");
    const data = parseTextFields(raw);
    expect(data.conceptos).toContain("Refrigerador — 12000");
    expect(data.conceptos).toContain("Silla de oficina — 800.5");
  });

  it("normaliza fechas con año de dos dígitos a cuatro", () => {
    const data = parseTextFields("Fecha: 1/6/24");
    expect(data.fecha).toBe("1/6/2024");
  });

  it("no puebla campos que no aparecen", () => {
    const data = parseTextFields("Alguna otra línea de texto");
    expect(data.total).toBeNull();
    expect(data.emisor).toBe("");
    expect(data.conceptos).toEqual([]);
  });
});