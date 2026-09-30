import { NextResponse } from "next/server";
import { saveDocument } from "@/lib/storage";
import {
  MAX_UPLOAD_SIZE,
  isAllowedFile,
  mimeFromName,
  validateContent,
} from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Se requiere un archivo." }, { status: 400 });
    }

    if (!isAllowedFile(file.name, file.type)) {
      return NextResponse.json(
        { error: "Solo se permiten imágenes (PNG, JPEG, WEBP, GIF, BMP, SVG) o archivos PDF." },
        { status: 415 }
      );
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { error: "El archivo supera el límite de 25 MB." },
        { status: 413 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type || mimeFromName(file.name) || "application/octet-stream";

    if (!validateContent(mime, bytes)) {
      return NextResponse.json(
        { error: "El archivo está vacío, incompleto o corrupto." },
        { status: 415 }
      );
    }

    const id = await saveDocument(file.name, mime, bytes);

    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}