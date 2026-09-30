import { preparePages } from "./render";
import { callOllama, getOllamaConfig, isOllamaAvailable } from "./ollama";
import { parseTextFields } from "./textfields";

export type DocType = "factura" | "recibo" | "nomina" | "contrato" | "otros";

export interface AnalysisResult {
  provider: string | null;
  model: string | null;
  document_type: DocType;
  confidence: number | null;
  extracted: Record<string, unknown> | null;
  raw_text: string | null;
  error: string | null;
  validated?: boolean | null;
}

const PROMPT_BASE = `You are an expert assistant that reads business documents and extracts structured data.
Determine the document type among: "factura" (invoice/bill), "recibo" (receipt/payment proof), "nomina" (payroll/payslip) or "contrato" (contract/agreement). Use "otros" if none fits.

Analyze ALL the provided information about the document and return ONLY valid JSON (no markdown fences, no extra text) with exactly this structure:
{
  "document_type": "factura" | "recibo" | "nomina" | "contrato" | "otros",
  "confidence": <number 0 to 1, how sure you are>,
  "data": {
    "emisor": "<issuer/seller/company name>",
    "receptor": "<buyer/employee/counterparty name>",
    "rfc": "<tax id if present>",
    "fecha": "<date dd/mm/yyyy>",
    "folio": "<document number>",
    "conceptos": ["<one string per line item / concept>"],
    "subtotal": <number|null>,
    "impuestos": <number|null>,
    "total": <number|null>,
    "moneda": "<currency code>",
    "otros": ["<campo: valor for other relevant fields>"]
  }
}
Rules:
- Extract every visible field from the document. NEVER invent amounts, names, dates or numbers.
- If a numeric field is not visible use null (never 0). If a text field is missing use "".
- For payroll: emisor = company, receptor = employee, and put earnings/deductions as conceptos.
- For contracts: put the contract parties in emisor/receptor and key clauses in conceptos/otros.
- Answer in the document's original language.`;

function buildPrompt(pageText?: string): string {
  if (pageText && pageText.trim().length > 0) {
    return `${PROMPT_BASE}

DOCUMENT TEXT (extracted programmatically; ordering/columns may be imperfect but the values are exact):
<<<
${pageText}
>>>

Base your extraction on this text. The attached image (if any) shows the page layout.`;
  }
  return `${PROMPT_BASE}

The document image is attached. Base your extraction on the text visible in the image.`;
}

const SYNONYMS: Record<DocType, string[]> = {
  factura: ["factura", "invoice", "cfdi", "boleta", "nota de venta"],
  recibo: ["recibo", "receipt", "ticket", "pago", "payment", "abono"],
  nomina: ["nomina", "payroll", "payslip", "salario", "percepciones", "sueldo"],
  contrato: ["contrato", "contract", "acuerdo", "clausula", "parte contratante"],
  otros: [],
};

const KEYWORDS: Record<DocType, string[]> = {
  ...SYNONYMS,
  otros: [],
};

function normalizeTypeFromToken(token: string): DocType {
  const t = token.toLowerCase().trim();
  if (t.includes("factura") || t.includes("invoice") || t.includes("boleta")) {
    return "factura";
  }
  if (t.includes("recibo") || t.includes("receipt") || t.includes("ticket") || t.includes("pago")) {
    return "recibo";
  }
  if (t.includes("nomina") || t.includes("payroll") || t.includes("payslip")) {
    return "nomina";
  }
  if (t.includes("contrato") || t.includes("contract") || t.includes("acuerdo")) {
    return "contrato";
  }
  return "otros";
}

export function detectTypeFromText(
  visionType: unknown,
  rawText: string
): { type: DocType; confidence: number | null } {
  if (visionType) {
    const t = normalizeTypeFromToken(String(visionType));
    if (t !== "otros") {
      return { type: t, confidence: null };
    }
  }

  const text = rawText.toLowerCase();
  const counts = new Map<DocType, number>();
  for (const key of Object.keys(KEYWORDS) as DocType[]) {
    counts.set(
      key,
      KEYWORDS[key].reduce((acc, kw) => acc + countOccurrences(text, kw), 0)
    );
  }

  let best: DocType = "otros";
  let bestCount = 0;
  let total = 0;
  counts.forEach((c, k) => {
    total += c;
    if (c > bestCount) {
      bestCount = c;
      best = k;
    }
  });

  const confidence =
    best === "otros" || bestCount === 0
      ? null
      : Number(Math.min(0.95, bestCount / Math.max(1, total) + 0.35).toFixed(2));

  return { type: best, confidence };
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle || needle.length < 4) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

function parseModelJson(raw: string): Record<string, unknown> | null {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function mergeJson(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const key of Object.keys(b)) {
    if (out[key] === undefined || out[key] === null) {
      out[key] = b[key];
    } else if (key === "data" && typeof out[key] === "object" && typeof b[key] === "object") {
      out[key] = mergeJson(out[key] as Record<string, unknown>, b[key] as Record<string, unknown>);
    }
  }
  return out;
}

function normalizeWord(v: unknown): string {
  return String(v ?? "").replace(/[":,]/g, "").trim();
}

export async function analyzeDocument(
  _filename: string,
  mimeType: string,
  data: Buffer,
  onProgress?: (done: number, total: number) => void
): Promise<AnalysisResult> {
  const { host, model } = getOllamaConfig();
  const availability = await isOllamaAvailable(host);
  if (!availability.ok) {
    return {
      provider: "ollama",
      model,
      document_type: "otros",
      confidence: null,
      extracted: null,
      raw_text: null,
      error: availability.message ?? "Ollama no disponible",
    };
  }

  const pages = await preparePages(data, mimeType);
  if (pages.length === 0) {
    return {
      provider: "ollama",
      model,
      document_type: "otros",
      confidence: null,
      extracted: null,
      raw_text: null,
      error: "No se pudo preparar el documento para el análisis.",
    };
  }

  let modelJson: Record<string, unknown> | null = null;
  const texts: string[] = [];
  const modelRawTexts: string[] = [];
  const callErrors: string[] = [];
  let callsMade = 0;

  const processablePages = pages.filter(
    (page) =>
      Boolean((page.image && page.image.length > 0) || (page.text && page.text.trim().length > 0))
  );
  let processedPages = 0;

  for (const page of pages) {
    const prompt = buildPrompt(page.text);
    const hasContent = Boolean(
      (page.image && page.image.length > 0) || (page.text && page.text.trim().length > 0)
    );
    if (!hasContent) continue;

    try {
      const raw = await callOllama(host, model, prompt, page.image);
      callsMade++;
      const parsed = parseModelJson(raw);
      if (parsed) {
        modelJson = modelJson ? mergeJson(modelJson, parsed) : parsed;
      } else if (raw.trim()) {
        modelRawTexts.push(raw.trim());
        if (page.text) texts.push(page.text);
      }
    } catch (err) {
      callErrors.push(err instanceof Error ? err.message : String(err));
      if (page.text) texts.push(page.text);
    }

    processedPages++;
    onProgress?.(processedPages, processablePages.length);
  }

  const rawText = [...modelRawTexts, ...texts].join("\n\n");
  const modelData = modelJson?.data as Record<string, unknown> | undefined;

  const { type, confidence: heuristicConf } = detectTypeFromText(
    modelJson?.document_type ?? modelJson?.type,
    rawText
  );

  let extracted: Record<string, unknown> | null = null;
  if (modelData && Object.keys(modelData).length > 0) {
    extracted = {
      emisor: str(modelData.emisor),
      receptor: str(modelData.receptor),
      rfc: str(modelData.rfc),
      fecha: str(modelData.fecha),
      folio: str(modelData.folio),
      conceptos: Array.isArray(modelData.conceptos) ? modelData.conceptos.filter(Boolean) : [],
      subtotal: num(modelData.subtotal),
      impuestos: num(modelData.impuestos),
      total: num(modelData.total),
      moneda: str(modelData.moneda),
      otros: Array.isArray(modelData.otros) ? modelData.otros.filter(Boolean) : [],
    };
  } else if (rawText.trim()) {
    const fields = parseTextFields(rawText);
    extracted = {
      emisor: str(fields.emisor),
      receptor: str(fields.receptor),
      rfc: str(fields.rfc),
      fecha: str(fields.fecha),
      folio: str(fields.folio),
      conceptos: Array.isArray(fields.conceptos)
        ? (fields.conceptos as string[])
        : [],
      subtotal: num(fields.subtotal),
      impuestos: num(fields.impuestos),
      total: num(fields.total),
      moneda: str(fields.moneda),
      otros: Array.isArray(fields.otros) ? (fields.otros as string[]) : [],
    };
  }

  const rawConfidence =
    typeof modelJson?.confidence === "number" ? Number(modelJson.confidence) : heuristicConf;
  const confidence =
    rawConfidence !== null && isFinite(rawConfidence)
      ? Math.min(1, Math.max(0, rawConfidence))
      : rawConfidence;

  let error: string | null = null;
  if (!modelJson && callsMade === 0 && callErrors.length > 0) {
    error = callErrors[0];
  }

  return {
    provider: "ollama",
    model,
    document_type: type,
    confidence,
    extracted,
    raw_text: rawText.length > 0 ? rawText : null,
    error,
  };
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}