import { pool } from "./db";
import { ensureSchema } from "./schema";

const DOC_TYPES = ["factura", "recibo", "nomina", "contrato"] as const;

const AGG_WORDS = [
  "todos",
  "todas",
  "totales",
  "total general",
  "total de todos",
  "suma",
  "sumar",
  "sumatoria",
  "sumas",
  "promedio",
  "media",
  "máximo",
  "mínimo",
  "maximo",
  "minimo",
  "cuántos",
  "cuántas",
  "cuantos",
  "cuantas",
  "cuenta",
  "contar",
  "cantidad",
  "conteo",
  "general",
  "en total",
  "en general",
  "resumen",
  "resumir",
  "cuánto",
  "cuanto",
  "fechas",
];

const GROUP_WORDS = [
  "documentos",
  "documento",
  "facturas",
  "factura",
  "recibos",
  "recibo",
  "nóminas",
  "nominas",
  "nómina",
  "nomina",
  "contratos",
  "contrato",
  "guardados",
  "guardadas",
  "guardado",
  "guardada",
];

const SPECIFIC_FILE_RE = /\.(pdf|jpg|jpeg|png|webp|gif|bmp)$|«[^»]+»/i;
const TYPE_QUESTION_RE = /qué (tipos|tipo) de (documentos|facturas|recibos|n[oó]minas|contratos)/i;

export function isAggregateQuery(question: string): boolean {
  const q = question.toLowerCase().trim();
  if (!q) return false;

  if (/todos? los documentos|totales? generales?|total de todos|totales? de todos|en general|resumen general/.test(q)) {
    return true;
  }
  if (TYPE_QUESTION_RE.test(q)) {
    return true;
  }
  if (/suma de todos los|todos los totales|totales de todos|promedio de todos|cu[aá]nto (suman|suma|es el total) (de todos|en total)/.test(q)) {
    return true;
  }

  const hasAgg = AGG_WORDS.some((w) => q.includes(w));
  const hasGroup = GROUP_WORDS.some((w) => q.includes(w));
  if (!hasAgg || !hasGroup) return false;

  if (SPECIFIC_FILE_RE.test(q)) return false;

  return true;
}

export function detectDocTypeFilter(question: string): string | null {
  const q = question.toLowerCase().trim();
  for (const t of DOC_TYPES) {
    const plural = t === "nomina" ? "n[oó]minas" : `${t}s`;
    if (new RegExp(`\\b${t}\\b|${plural}`).test(q)) return t;
  }
  return null;
}

function formatAmount(n: number): string {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseAmount(raw: unknown): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/[$€\s]/g, "");
  if (/,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export interface AggregateSource {
  id: string;
  filename: string;
  doc_type: string | null;
  similarity: null;
  meta: string;
}

export interface AggregateResult {
  mode: "sql";
  summary: string;
  fallbackText: string;
  sources: AggregateSource[];
}

interface DocRow {
  id: string;
  filename: string;
  doc_type: string | null;
  validated: boolean;
  total: string | null;
  fecha: string | null;
}

export async function runAggregateQuery(question: string): Promise<AggregateResult> {
  await ensureSchema();

  const typeFilter = detectDocTypeFilter(question);
  const params: string[] = typeFilter ? [typeFilter] : [];
  const where = typeFilter ? "WHERE doc_type = $1" : "";

  const result = await pool.query(
    `SELECT id, filename, doc_type, validated,
            extracted_json->>'total' AS total,
            extracted_json->>'fecha' AS fecha
     FROM documents
     ${where}
     ORDER BY validated DESC, created_at DESC`,
    params
  );
  const rows = result.rows as DocRow[];

  const totalDocs = rows.length;
  const validatedCount = rows.filter((r) => r.validated).length;

  const byType = new Map<string, number>();
  for (const r of rows) {
    const t = r.doc_type ?? "otros";
    byType.set(t, (byType.get(t) ?? 0) + 1);
  }
  const typeSummary =
    Array.from(byType.entries())
      .map(([t, n]) => `${t}: ${n}`)
      .join(", ") || "ninguno";

  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let minFile: string | null = null;
  let maxFile: string | null = null;
  const withAmount: DocRow[] = [];
  const byTypeSum = new Map<string, number>();

  for (const r of rows) {
    const n = parseAmount(r.total);
    if (n == null) continue;
    r.total = formatAmount(n);
    withAmount.push(r);
    sum += n;
    byTypeSum.set(r.doc_type ?? "otros", (byTypeSum.get(r.doc_type ?? "otros") ?? 0) + n);
    if (n < min) {
      min = n;
      minFile = r.filename;
    }
    if (n > max) {
      max = n;
      maxFile = r.filename;
    }
  }

  const nAmounts = withAmount.length;
  const avg = nAmounts ? sum / nAmounts : 0;

  const scope = typeFilter ? ` del tipo «${typeFilter}»` : "";
  const summaryLines: string[] = [
    `Documentos guardados${scope}: ${totalDocs} (${validatedCount} validados, ${totalDocs - validatedCount} pendientes).`,
    `Por tipo${scope}: ${typeSummary}.`,
  ];

  if (nAmounts > 0) {
    summaryLines.push(
      `${nAmounts} documento(s) con total numérico. ` +
        `Suma: ${formatAmount(sum)} · Promedio: ${formatAmount(avg)} · ` +
        `Máximo: ${formatAmount(max)} (${maxFile}) · Mínimo: ${formatAmount(min)} (${minFile}).`
    );
    if (!typeFilter && byTypeSum.size > 0) {
      summaryLines.push(
        "Total por tipo: " +
          Array.from(byTypeSum.entries()).map(([t, n]) => `${t} ${formatAmount(n)}`).join(" · ") +
          "."
      );
    }
  } else {
    summaryLines.push("Ningún documento tiene un total (columna extracted_json->>'total') numérico.");
  }

  const consumption = question.trim();

  const summary =
    `Datos SQL de la tabla public.documents` +
    (typeFilter ? ` (doc_type = ${typeFilter})` : "") +
    `:\n- ` +
    summaryLines.join("\n- ");

  const fallbackText =
    `Respuesta calculada con consulta SQL a la tabla de documentos:\n` +
    summaryLines.map((l) => `• ${l}`).join("\n") +
    `\n\nPregunta respondida: «${consumption}»`;

  const sources: AggregateSource[] = withAmount.slice(0, 20).map((r) => ({
    id: r.id,
    filename: r.filename,
    doc_type: r.doc_type,
    similarity: null,
    meta: `Total: ${r.total}`,
  }));

  return { mode: "sql", summary, fallbackText, sources };
}

/* --- Búsqueda de texto específico (SQL LIKE/ILIKE, sin embeddings) --- */

const TEXT_TRIGGER_RE =
  /\b(buscar|busca|busque|buscando|buscas|busc[aá]s|b[uú]squeda|encontrar|encuentra|encuentre|encuentras|aparece|aparecen|contiene|contienen|contenga|contengan|tiene|tienen|tenga|tengan|menciona|mencionan|mencione|menci[oó]n|hablan? (?:de|sobre)|hablen (?:de|sobre)|d[oó]nde (?:est[aá]|aparece)|en qu[eé] documentos?|qu[eé] documentos? (?:contienen|tienen)|puedes buscar|puede buscar|puedes encontrar)/i;

const QUOTED_RE = /[«"“]([^»"”]{2,120})[»"”]/;

function stripFiller(str: string): string {
  let s = str.trim();
  s = s.replace(/[?!.]+$/, "").trim();
  s = s
    .split(
      /\s+(?:en|dentro de)\s+(?:(?:los|las|el|la|mi|mis|tus|todos|todas|de|lo|unos|unas|alg[uú]n|alg[uú]na|t[oó]d[ií]?[oa]s) )*(?:documentos?|facturas?|recibos?|n[oó]minas?|contratos?|pdfs?|archivos? pdf|documentos? pdf|la bd|la base de datos|la tabla|guardados?|archivos?|registros?|filas?)/i
    )[0]
    .trim();
  while (true) {
    const before = s;
    s = s
      .replace(
        /^(?:de |del |el |la |los |las |un |una |este |esta |estas |ese |esa |esos |esas |todo |toda |el (?:texto|t[eé]rmino|folio|rfc|art[ií]culo)|la (?:palabra|cadena|frase)|este texto|ese texto|su texto|contenido|texto|palabra|cadena|frase)[ .,;:]*/i,
        ""
      )
      .trim();
    if (s === before) break;
  }
  return s.trim();
}

export function extractSearchTerm(question: string): string | null {
  const q = question.trim();
  if (!q) return null;

  const quoted = q.match(QUOTED_RE);
  if (quoted) {
    const term = quoted[1].trim();
    return term.length >= 2 ? term : null;
  }

  const m = q.match(
    /\b(buscar|busca|busque|buscando|b[uú]squeda|encontrar|encuentra|encuentre|aparece|aparecen|contiene|contienen|contenga|contengan|menciona|mencionan|mencione|menci[oó]n|hablan? (?:de|sobre)|hablen (?:de|sobre))\s+(.+)$/i
  );
  if (!m) return null;

  const term = stripFiller(m[2]);
  return term.length >= 2 ? term : null;
}

export function isTextSearchQuery(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  if (!TEXT_TRIGGER_RE.test(q)) return false;
  const term = extractSearchTerm(q);
  if (term == null || term.length < 2) return false;
  // Si parece un nombre de archivo específico, mejor buscarlo por semántica
  if (/\.(pdf|jpg|jpeg|png|webp|gif|bmp)$/i.test(term)) return false;
  return true;
}

export interface TextHit {
  id: string;
  filename: string;
  doc_type: string | null;
  validated: boolean;
  similarity: null;
  in_name: boolean;
  snippet: string | null;
  meta: string;
}

export interface TextSearchResult {
  mode: "sql";
  term: string;
  count: number;
  best: TextHit | null;
  summary: string;
  fallbackText: string;
  hits: TextHit[];
}

export async function runTextSearch(term: string, limit = 20): Promise<TextSearchResult> {
  await ensureSchema();

  const pattern = `%${term.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const result = await pool.query(
    `SELECT id, filename, doc_type, validated, raw_text, extracted_json,
            (filename ILIKE $1) AS in_name
     FROM documents
     WHERE filename ILIKE $1 OR raw_text ILIKE $1 OR extracted_json::text ILIKE $1
     ORDER BY (doc_type IS NOT NULL) DESC, created_at DESC
     LIMIT $2`,
    [pattern, limit]
  );
  const rows = result.rows as Array<{
    id: string;
    filename: string;
    doc_type: string | null;
    validated: boolean;
    raw_text: string | null;
    extracted_json: unknown;
    in_name: boolean;
  }>;

  const termLower = term.toLowerCase();
  const hits: TextHit[] = rows.map((r) => {
    const hay = `${r.raw_text ?? ""} \u0001 ${JSON.stringify(r.extracted_json ?? {})}`;
    const idx = hay.toLowerCase().indexOf(termLower);
    let snippet: string | null = null;
    if (idx >= 0) {
      const start = Math.max(0, idx - 40);
      const end = Math.min(hay.length, idx + term.length + 60);
      snippet =
        (start > 0 ? "…" : "") +
        hay.slice(start, end).replace(/\s+/g, " ").trim() +
        (end < hay.length ? "…" : "");
    }
    return {
      id: r.id,
      filename: r.filename,
      doc_type: r.doc_type ?? null,
      validated: Boolean(r.validated),
      similarity: null,
      in_name: Boolean(r.in_name),
      snippet,
      meta: r.in_name ? "Coincide en el nombre del archivo" : `Contiene «${term}»`,
    };
  });

  const names = hits.map((h) => h.filename).join(", ");
  const best = hits[0] ?? null;
  const summary =
    `Búsqueda SQL (ILIKE) de «${term}» en la tabla documents (raw_text, extracted_json, filename). ` +
    `Coincidencias: ${hits.length}.\nDocumentos: ${names || "ninguno"}.` +
    (best ? `\nPDF aproximado (mejor coincidencia): ${best.filename}.` : "");

  const fallbackText =
    hits.length > 0
      ? `Resultado de la búsqueda de «${term}» (consulta SQL con ILIKE):\n` +
        `${best ? `• PDF aproximado: ${best.filename}\n` : ""}` +
        hits
          .map((h) => `• ${h.filename}${h.doc_type ? ` (${h.doc_type})` : ""}${h.snippet ? ` → ${h.snippet}` : ""}`)
          .join("\n")
      : `No encontré el texto «${term}» en ningún PDF/documento guardado.`;

  return { mode: "sql", term, count: hits.length, best, summary, fallbackText, hits };
}