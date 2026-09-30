import { describe, it, expect } from "vitest";
import { parseManual, parseManualPairs } from "@/lib/manual";

describe("parseManualPairs", () => {
  it("parsea claves con # en varias líneas", () => {
    const pairs = parseManualPairs("#sueldo: 10,300\n#moneda: MX\nDireccion: Paseos del jardin");
    expect(pairs).toEqual([
      { key: "sueldo", value: "10,300" },
      { key: "moneda", value: "MX" },
      { key: "Direccion", value: "Paseos del jardin" },
    ]);
  });

  it("parsea claves en una sola línea separadas por coma", () => {
    const pairs = parseManualPairs("#moneda: MX, Direccion: Paseos del jardin");
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toEqual({ key: "moneda", value: "MX" });
    expect(pairs[1]).toEqual({ key: "Direccion", value: "Paseos del jardin" });
  });

  it("no parte números con comas (miles)", () => {
    const pairs = parseManualPairs("#total: 10,300, #moneda: MXN, total a pagar: 10,300");
    expect(pairs).toHaveLength(3);
    expect(pairs[0].key).toBe("total");
    expect(pairs[0].value).toBe("10,300");
    expect(pairs[2].value).toBe("10,300");
  });

  it("ignora texto sin formato clave: valor", () => {
    expect(parseManualPairs("esto no es una clave valor")).toHaveLength(0);
  });
});

describe("parseManual", () => {
  it("mapea claves conocidas y guarda el resto como otros", () => {
    const r = parseManual(
      "#sueldo: 10,300 #moneda: MX\nDireccion: Paseos del jardin\nemisor: Empresa SA\ntotal: 12,000"
    );
    expect(r.emisor).toBe("Empresa SA");
    expect(r.moneda).toBe("MX");
    expect(r.total).toBe(12000);
    expect(r.otros).toEqual(["sueldo: 10,300", "Direccion: Paseos del jardin"]);
  });

  it("normaliza números y moneda", () => {
    const r = parseManual("Subtotal: $1,500.50\nIVA: 240\nMoneda: mxn");
    expect(r.subtotal).toBe(1500.5);
    expect(r.impuestos).toBe(240);
    expect(r.moneda).toBe("MXN");
  });

  it("agrupa conceptos", () => {
    const r = parseManual("Conceptos: Facturación del mes\nDescripcion: Servicios de hosting");
    expect(r.conceptos).toEqual(["Facturación del mes", "Servicios de hosting"]);
  });

  it("usa alias de emisor/receptor (razón social y cliente)", () => {
    const r = parseManual("Razon Social: Koibanx SA de CV\nCliente: Persona Fisica");
    expect(r.emisor).toBe("Koibanx SA de CV");
    expect(r.receptor).toBe("Persona Fisica");
  });
});