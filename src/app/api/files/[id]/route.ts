import { NextRequest, NextResponse } from "next/server";
import { deleteDocument, getDocument, updateDocType, updateExtracted } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const doc = await getDocument(params.id);
    if (!doc) {
      return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(doc.content), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `inline; filename="${doc.filename}"`,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const doc = await getDocument(params.id);
    if (!doc) {
      return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const extracted = body?.extracted;
    const docType = body?.doc_type;

    if (extracted != null) {
      if (typeof extracted !== "object" || extracted === null) {
        return NextResponse.json(
          { error: "Se esperaba el campo 'extracted'." },
          { status: 400 }
        );
      }
      await updateExtracted(params.id, extracted as Record<string, unknown>);
      return NextResponse.json({ ok: true });
    }

    if (typeof docType === "string" && docType) {
      const updated = await updateDocType(params.id, docType);
      if (!updated) {
        return NextResponse.json(
          { error: "Tipo de documento no válido o archivo no encontrado." },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { error: "Se esperaba 'extracted' o 'doc_type'." },
      { status: 400 }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const deleted = await deleteDocument(params.id);
    if (!deleted) {
      return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}