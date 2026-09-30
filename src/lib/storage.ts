import { pool } from "./db";
import { computeTextVector, computeVector, vectorToSql, VECTOR_DIM } from "./vector";
import { ensureSchema } from "./schema";
import type { AnalysisResult } from "./analysis";

export interface DocumentRow {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  doc_type: string | null;
  doc_score: number | null;
  extracted_json: Record<string, unknown> | null;
  raw_text: string | null;
  analysis_provider: string | null;
  analysis_model: string | null;
  validated: boolean;
}

export async function saveDocument(
  filename: string,
  mimeType: string,
  content: Buffer
): Promise<string> {
  await ensureSchema();
  const embedding = computeVector(content);
  const result = await pool.query(
    `INSERT INTO documents (filename, mime_type, size_bytes, content, embedding)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [filename, mimeType, content.length, content, vectorToSql(embedding)]
  );
  return (result.rows[0] as { id: string }).id;
}

export async function listDocuments(): Promise<DocumentRow[]> {
  await ensureSchema();
  const result = await pool.query<DocumentRow>(
    `SELECT id, filename, mime_type, size_bytes, created_at,
            doc_type, doc_score, extracted_json, raw_text,
            analysis_provider, analysis_model, validated
     FROM documents
     ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function getDocument(
  id: string
): Promise<{ filename: string; mimeType: string; content: Buffer } | null> {
  await ensureSchema();
  const result = await pool.query(
    `SELECT filename, mime_type, content
     FROM documents
     WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    filename: row.filename,
    mimeType: row.mime_type,
    content: Buffer.from(row.content),
  };
}

export async function getAnalysis(id: string): Promise<AnalysisResult | null> {
  await ensureSchema();
  const result = await pool.query(
    `SELECT doc_type, doc_score, extracted_json, raw_text,
            analysis_provider, analysis_model, validated
     FROM documents
     WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (!row.doc_type && !row.extracted_json && !row.raw_text) {
    return null;
  }
  return {
    provider: row.analysis_provider ?? null,
    model: row.analysis_model ?? null,
    document_type: row.doc_type ?? null,
    confidence: row.doc_score ?? null,
    extracted: row.extracted_json,
    raw_text: row.raw_text ?? null,
    error: null,
    validated: Boolean(row.validated),
  };
}

export function extractedToText(extracted: Record<string, unknown> | null): string {
  if (!extracted) return "";
  const parts: string[] = [];
  const push = (v: unknown) => {
    if (v == null) return;
    const s = Array.isArray(v) ? (v as unknown[]).map(String).join("\n") : String(v);
    if (s.trim()) parts.push(s.trim());
  };
  push(extracted.emisor);
  push(extracted.receptor);
  push(extracted.rfc);
  push(extracted.fecha);
  push(extracted.folio);
  push(extracted.moneda);
  push(extracted.subtotal);
  push(extracted.impuestos);
  push(extracted.total);
  push(extracted.conceptos);
  push(extracted.otros);
  return parts.join("\n");
}

export function analysisToText(
  extracted: Record<string, unknown> | null,
  rawText: string | null
): string {
  const t = extractedToText(extracted);
  return t ? `${t}\n${rawText ?? ""}` : rawText ?? "";
}

export async function saveAnalysis(
  id: string,
  result: AnalysisResult
): Promise<void> {
  await ensureSchema();
  const text = analysisToText(result.extracted, result.raw_text);
  const embedding = text.trim() ? vectorToSql(computeTextVector(text)) : null;
  await pool.query(
    `UPDATE documents
     SET doc_type = $2, doc_score = $3, extracted_json = $4::jsonb,
         raw_text = $5, analysis_provider = $6, analysis_model = $7,
         embedding = COALESCE($8::vector, embedding),
         validated = FALSE
     WHERE id = $1`,
    [
      id,
      result.document_type,
      result.confidence,
      JSON.stringify(result.extracted ?? null),
      result.raw_text,
      result.provider,
      result.model,
      embedding,
    ]
  );
}

export async function updateExtracted(
  id: string,
  extracted: Record<string, unknown> | null
): Promise<void> {
  await ensureSchema();
  const text = extractedToText(extracted);
  const embedding = text.trim() ? vectorToSql(computeTextVector(text)) : null;
  await pool.query(
    `UPDATE documents
     SET extracted_json = $2::jsonb, embedding = COALESCE($3::vector, embedding),
         validated = TRUE
     WHERE id = $1`,
    [id, JSON.stringify(extracted), embedding]
  );
}

const VALID_DOC_TYPES = new Set(["factura", "recibo", "nomina", "contrato", "otros"]);

export async function updateDocType(id: string, docType: string): Promise<boolean> {
  await ensureSchema();
  if (!VALID_DOC_TYPES.has(docType)) return false;
  const result = await pool.query(
    `UPDATE documents SET doc_type = $2 WHERE id = $1`,
    [id, docType]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteDocument(id: string): Promise<boolean> {
  await ensureSchema();
  const result = await pool.query(`DELETE FROM documents WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export { VECTOR_DIM };