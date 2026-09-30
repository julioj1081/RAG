import { NextResponse } from "next/server";
import { listDocuments, VECTOR_DIM } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const docs = await listDocuments();
    return NextResponse.json({ vectors: VECTOR_DIM, files: docs });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}