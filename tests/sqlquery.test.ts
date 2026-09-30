import { describe, expect, it } from "vitest";
import {
  isAggregateQuery,
  parseAmount,
  detectDocTypeFilter,
  extractSearchTerm,
  isTextSearchQuery,
} from "@/lib/sqlquery";

describe("isAggregateQuery", () => {
  it("detecta totales generales sobre todos los documentos", () => {
    expect(isAggregateQuery("¿Cuál es el total general de todos los documentos?")).toBe(true);
    expect(isAggregateQuery("¿Cuánto suma el total de todos los documentos?")).toBe(true);
    expect(isAggregateQuery("totales generales de los documentos")).toBe(true);
  });

  it("detecta conteos y cantidades", () => {
    expect(isAggregateQuery("¿Cuántos documentos tengo guardados?")).toBe(true);
    expect(isAggregateQuery("¿Cuántas facturas he guardado?")).toBe(true);
    expect(isAggregateQuery("¿Cuántos recibos hay?")).toBe(true);
  });

  it("detecta operaciones de cálculo (suma, promedio, máximo, mínimo)", () => {
    expect(isAggregateQuery("¿Cuál es la suma de todos los totales?")).toBe(true);
    expect(isAggregateQuery("promedio de montos de los documentos")).toBe(true);
    expect(isAggregateQuery("¿Cuál es el máximo total de las facturas?")).toBe(true);
    expect(isAggregateQuery("mínimo total entre los documentos")).toBe(true);
  });

  it("detecta resúmenes y preguntas de tipo", () => {
    expect(isAggregateQuery("resumen general de los documentos")).toBe(true);
    expect(isAggregateQuery("¿Qué tipos de documentos tengo guardados?")).toBe(true);
  });

  it("NO detecta preguntas sobre un documento específico", () => {
    expect(isAggregateQuery("¿Cuál es el total de la factura de Mi Empresa S.A.?")).toBe(false);
    expect(isAggregateQuery("¿Qué dice «factura.pdf»?")).toBe(false);
    expect(isAggregateQuery("¿Cuál fue el monto de la factura XYZ?")).toBe(false);
    expect(isAggregateQuery("¿Quién emitió la nómina de julio?")).toBe(false);
  });

  it("devuelve false para texto vacío", () => {
    expect(isAggregateQuery("")).toBe(false);
    expect(isAggregateQuery("   ")).toBe(false);
  });
});

describe("detectDocTypeFilter", () => {
  it("reconoce tipo singular y plural", () => {
    expect(detectDocTypeFilter("¿Cuántas facturas tengo?")).toBe("factura");
    expect(detectDocTypeFilter("¿Cuál es el total de los recibos?")).toBe("recibo");
    expect(detectDocTypeFilter("¿Cuántas nóminas hay?")).toBe("nomina");
    expect(detectDocTypeFilter("¿qué dice el contrato?")).toBe("contrato");
  });

  it("devuelve null cuando no hay tipo", () => {
    expect(detectDocTypeFilter("¿Cuántos documentos hay?")).toBeNull();
  });
});

describe("parseAmount", () => {
  it("parsea números simples", () => {
    expect(parseAmount("1250.50")).toBe(1250.5);
    expect(parseAmount("1250")).toBe(1250);
    expect(parseAmount(1250.5)).toBe(1250.5);
  });

  it("normaliza símbolos y espacios", () => {
    expect(parseAmount("$1,250.00")).toBe(1250);
    expect(parseAmount("1 250,50")).toBe(1250.5);
  });

  it("rechaza no numéricos", () => {
    expect(parseAmount("no disponible")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });
});

describe("extractSearchTerm", () => {
  it("extrae entre comillas francesas", () => {
    expect(extractSearchTerm("¿En qué documentos aparece «R-99»?")).toBe("R-99");
    expect(extractSearchTerm("busca la palabra «gasolina»")).toBe("gasolina");
  });

  it("extrae después de verbos de búsqueda y quita relleno", () => {
    expect(extractSearchTerm("busca el folio R-99 en todos los documentos")).toBe("folio R-99");
    expect(extractSearchTerm("¿Qué documentos contienen el RFC XAXX010101000?")).toBe("RFC XAXX010101000");
    expect(extractSearchTerm("menciona Mi Empresa S.A. en las facturas")).toBe("Mi Empresa S.A.");
    expect(extractSearchTerm("¿puedes buscar el texto R-99 en todos los PDFs?")).toBe("R-99");
    expect(extractSearchTerm("busca este texto R-99 en los pdfs subidos")).toBe("R-99");
  });

  it("devuelve null sin término", () => {
    expect(extractSearchTerm("")).toBeNull();
    expect(extractSearchTerm("¿Cuántos documentos hay?")).toBeNull();
  });
});

describe("isTextSearchQuery", () => {
  it("detecta búsquedas de texto por SQL", () => {
    expect(isTextSearchQuery("¿En qué documentos aparece «R-99»?")).toBe(true);
    expect(isTextSearchQuery("busca el folio R-99 en todos los documentos")).toBe(true);
    expect(isTextSearchQuery("¿Qué documentos contienen la palabra «gasolina»?")).toBe(true);
  });

  it("no detecta consultas que no buscan texto", () => {
    expect(isTextSearchQuery("¿Cuál es el total general de todos los documentos?")).toBe(false);
    expect(isTextSearchQuery("¿Cuántos documentos tengo?")).toBe(false);
    expect(isTextSearchQuery("¿Qué dice «factura.pdf»?")).toBe(false);
  });

  it("detecta búsquedas en todos los PDFs subidos", () => {
    expect(isTextSearchQuery("¿puedes buscar este texto «R-99» en todos los PDFs subidos?")).toBe(true);
    expect(isTextSearchQuery("¿puedes buscar el texto R-99 en todos los PDFs?")).toBe(true);
    expect(isTextSearchQuery("busca este texto R-99 en los pdfs subidos")).toBe(true);
  });
});