import { pool } from "./db";
import { ensureSchema } from "./schema";
import { computeTextVector, vectorToSql } from "./vector";

export interface SearchHit {
  id: string;
  filename: string;
  doc_type: string | null;
  similarity: number | null;
  extracted: Record<string, unknown> | null;
  raw_text: string | null;
}

export async function searchDocuments(query: string, limit = 4): Promise<SearchHit[]> {
  await ensureSchema();
  const vec = computeTextVector(query);
  const result = await pool.query(
    `SELECT id, filename, doc_type, extracted_json, raw_text,
            ROUND((1 - (embedding <=> $2::vector))::numeric, 6) AS similarity
     FROM documents
     WHERE embedding IS NOT NULL AND extracted_json IS NOT NULL
     ORDER BY embedding <=> $2::vector
     LIMIT $1`,
    [limit, vectorToSql(vec)]
  );
  return result.rows.map((row) => ({
    id: row.id as string,
    filename: row.filename as string,
    doc_type: (row.doc_type as string | null) ?? null,
    similarity: row.similarity != null ? Number(row.similarity) : null,
    extracted: row.extracted_json as Record<string, unknown> | null,
    raw_text: (row.raw_text as string | null) ?? null,
  }));
}

export function searchContext(hits: SearchHit[], question: string): string {
  const blocks = hits.map((h, i) => {
    const data = h.extracted ? JSON.stringify(h.extracted) : "—";
    const raw = (h.raw_text ?? "").slice(0, 4000);
    const sim = h.similarity != null ? `${Math.round(h.similarity * 100)}%` : "?";
    return `[${i + 1}] Documento: ${h.filename}\nSimilitud: ${sim}\nDatos: ${data}\nTexto: ${raw}`;
  });
  return `Pregunta: ${question}\n\nDocumentos disponibles:\n${blocks.join("\n\n")}`;
}