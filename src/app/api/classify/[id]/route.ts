import { NextResponse } from "next/server";
import { getDocument, getAnalysis, saveAnalysis } from "@/lib/storage";
import { analyzeDocument } from "@/lib/analysis";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const stored = await getAnalysis(params.id);
    if (!stored) {
      return NextResponse.json({ error: "Aún no se ha analizado." }, { status: 404 });
    }
    return NextResponse.json(stored);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const doc = await getDocument(params.id);
    if (!doc) {
      return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        try {
          const result = await analyzeDocument(doc.filename, doc.mimeType, doc.content, (done, total) => {
            send({ type: "progress", done, total });
          });
          await saveAnalysis(params.id, result);
          send({ type: "result", result });
        } catch (err) {
          console.error(err);
          send({
            type: "error",
            message: err instanceof Error ? err.message : "Error interno del servidor",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}