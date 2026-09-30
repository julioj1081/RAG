import { NextResponse } from "next/server";
import { searchDocuments, searchContext, type SearchHit } from "@/lib/search";
import { callOllamaChat, getOllamaConfig } from "@/lib/ollama";
import {
  isAggregateQuery,
  runAggregateQuery,
  isTextSearchQuery,
  extractSearchTerm,
  runTextSearch,
} from "@/lib/sqlquery";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT =
  "Eres un asistente de RAG para documentos almacenados. Responde SOLO con base en los documentos proporcionados " +
  "en el contexto. Cita SIEMPRE el documento de origen: nombra su archivo exacto precedido de [n] (posición de la lista) " +
  "y su porcentaje de similitud. Si no puedes responder con el contexto, dilo claramente. " +
  "Responde en español, conciso y estructurado.";

const SQL_SYSTEM_PROMPT =
  "Eres un asistente que responde a partir de datos agregados obtenidos con una consulta SQL a la tabla documents " +
  "de PostgreSQL. Usa EXCLUSIVAMENTE las cifras proporcionadas, no inventes ni extrapoles. " +
  "Responde en español, claro y conciso, indicando que los datos provienen de una consulta SQL a la base de datos.";

function fallbackAnswer(question: string, hits: SearchHit[]): string {
  const lines = [
    `Encontré ${hits.length} documento(s) relacionados con tu pregunta («${question}»). ` +
      "No pude generar una respuesta con el modelo, así que revisa los documentos citados:",
  ];
  for (const h of hits) {
    const sim = h.similarity != null ? ` (similitud ${Math.round(h.similarity * 100)}%)` : "";
    lines.push(`\n• ${h.filename}${sim}`);
    if (h.extracted) lines.push(`  ${JSON.stringify(h.extracted)}`);
  }
  return lines.join("\n");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json({ error: "Escribe una pregunta." }, { status: 400 });
    }

    const { host, model } = getOllamaConfig();

    const searchTerm = extractSearchTerm(question);
    if (isTextSearchQuery(question) && searchTerm) {
      const t = await runTextSearch(searchTerm, 20);

      if (t.hits.length === 0) {
        return NextResponse.json({
          answer: t.fallbackText,
          sources: [],
          mode: "sql",
        });
      }

      let answer: string;
      try {
        answer = await callOllamaChat(host, model, [
          { role: "system", content: SQL_SYSTEM_PROMPT },
          { role: "user", content: t.summary },
        ]);
      } catch {
        answer = "";
      }
      if (!answer.trim()) answer = t.fallbackText;

      const sources = t.hits.map((h, i) => ({
        id: h.id,
        filename: h.filename,
        doc_type: h.doc_type,
        similarity: null,
        meta: h.meta,
        best: i === 0 && t.best !== null,
      }));
      return NextResponse.json({ answer, sources, mode: "sql" });
    }

    if (isAggregateQuery(question)) {
      const agg = await runAggregateQuery(question);
      let answer: string;
      try {
        answer = await callOllamaChat(host, model, [
          { role: "system", content: SQL_SYSTEM_PROMPT },
          { role: "user", content: agg.summary },
        ]);
      } catch {
        answer = "";
      }
      if (!answer.trim()) answer = agg.fallbackText;
      return NextResponse.json({ answer, sources: agg.sources, mode: "sql" });
    }

    const hits = await searchDocuments(question, 4);

    const sources = hits.map((h) => ({
      id: h.id,
      filename: h.filename,
      doc_type: h.doc_type,
      similarity: h.similarity,
    }));

    if (hits.length === 0) {
      return NextResponse.json({
        answer: "No encontré documentos similares a tu pregunta entre los guardados.",
        sources: [],
        mode: "semantic",
      });
    }

    const context = searchContext(hits, question);

    let answer: string;
    try {
      answer = await callOllamaChat(host, model, [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: context },
      ]);
    } catch {
      answer = "";
    }

    if (!answer.trim()) {
      answer = fallbackAnswer(question, hits);
    }

    return NextResponse.json({ answer, sources, mode: "semantic" });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}