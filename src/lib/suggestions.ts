export interface SuggestionFile {
  filename: string;
  doc_type: string | null;
  extracted: Record<string, unknown> | null;
}

const TYPE_LABELS: Record<string, string> = {
  factura: "la factura",
  recibo: "el recibo",
  nomina: "la nómina",
  contrato: "el contrato",
  otros: "el documento",
};

const GENERIC = [
  "¿Puedes resumir los datos más importantes de los documentos más recientes?",
  "¿Cuántos documentos guardados tengo y de qué tipos?",
  "¿En qué fechas se emitieron mis documentos más recientes?",
  "¿Qué información puedo consultar sobre mis facturas y recibos?",
  "¿Cuál es el documento más reciente que guardé?",
];

function labelFor(docType: string | null): string {
  return docType && TYPE_LABELS[docType] ? TYPE_LABELS[docType] : "el documento";
}

export function buildSuggestions(files: SuggestionFile[], min = 3): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  };

  for (const f of files.filter((f) => f.extracted).slice(0, 3)) {
    const label = labelFor(f.doc_type);
    const total = f.extracted?.total;
    const folio = f.extracted?.folio;
    const emisor = f.extracted?.emisor;

    if (total != null && String(total).trim() !== "") {
      push(`¿Cuál es el total de ${label} «${f.filename}»?`);
    } else if (folio != null && String(folio).trim() !== "") {
      push(`¿Qué datos corresponden al folio ${String(folio)} de ${label} «${f.filename}»?`);
    } else if (emisor != null && String(emisor).trim() !== "") {
      push(`¿Quién emitió ${label} «${f.filename}»?`);
    } else {
      push(`¿Qué información contiene «${f.filename}»?`);
    }
  }

  for (const f of files.filter((f) => f.extracted).slice(0, 2)) {
    const folio = f.extracted?.folio;
    const rfc = f.extracted?.rfc;
    const term = pickTextTerm(folio, rfc);
    if (term) push(`¿En qué documentos aparece «${term}»?`);
  }

  for (const g of GENERIC) push(g);

  while (out.length < min) out.push(`¿Qué dice el documento «${files[0]?.filename ?? "guardado"}» sobre su contenido?`);

  return out.slice(0, 5);
}

function pickTextTerm(folio: unknown, rfc: unknown): string | null {
  for (const v of [folio, rfc]) {
    if (typeof v === "string" && v.trim().length >= 2) return v.trim();
    if (typeof v === "number" && String(v).length >= 2) return String(v);
  }
  return null;
}