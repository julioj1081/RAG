import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/storage", () => ({
  saveDocument: vi.fn(),
}));

import { saveDocument } from "@/lib/storage";
import { POST } from "@/app/api/upload/route";

const mockedSave = vi.mocked(saveDocument);

function pdfBuffer({ truncated = false, corrupt = false, empty = false } = {}): Uint8Array {
  if (empty) return new Uint8Array(0);
  if (corrupt) return new TextEncoder().encode("This is definitely not a PDF");
  const header = "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n";
  const eof = "\n%%EOF";
  return new TextEncoder().encode(header + (truncated ? "" : eof));
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

async function postFile(
  name: string,
  type: string,
  bytes: Uint8Array
): Promise<{ status: number; body: { error?: string; id?: string } | null }> {
  const form = new FormData();
  form.append("file", new File([bytes.slice().buffer as ArrayBuffer], name, { type }));
  const req = new Request("http://localhost/api/upload", { method: "POST", body: form });
  const res = await POST(req);
  const body = (await res.json().catch(() => null)) as { error?: string; id?: string } | null;
  return { status: res.status, body };
}

async function postWithoutFile(): Promise<{ status: number; body: { error?: string; id?: string } | null }> {
  const form = new FormData();
  form.append("file", "not-a-file");
  const req = new Request("http://localhost/api/upload", { method: "POST", body: form });
  const res = await POST(req);
  const body = (await res.json().catch(() => null)) as { error?: string; id?: string } | null;
  return { status: res.status, body };
}

beforeEach(() => {
  mockedSave.mockReset();
  mockedSave.mockResolvedValue("generated-id-123");
});

describe("POST /api/upload", () => {
  it("sube un PDF válido exitosamente (201) y guarda el documento", async () => {
    const { status, body } = await postFile("factura.pdf", "application/pdf", pdfBuffer());
    expect(status).toBe(201);
    expect(body?.id).toBe("generated-id-123");
    expect(mockedSave).toHaveBeenCalledTimes(1);
    const [name, mime, bytes] = mockedSave.mock.calls[0];
    expect(name).toBe("factura.pdf");
    expect(mime).toBe("application/pdf");
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect((bytes as Buffer).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("sube una imagen PNG válida exitosamente (201)", async () => {
    const { status } = await postFile("imagen.png", "image/png", PNG);
    expect(status).toBe(201);
    expect(mockedSave).toHaveBeenCalledTimes(1);
  });

  it("rechaza un PDF corrupto (415) sin guardar", async () => {
    const { status, body } = await postFile("corrupto.pdf", "application/pdf", pdfBuffer({ corrupt: true }));
    expect(status).toBe(415);
    expect(body?.error).toContain("incompleto o corrupto");
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("rechaza un PDF incompleto/truncado (415) sin guardar", async () => {
    const { status } = await postFile("truncado.pdf", "application/pdf", pdfBuffer({ truncated: true }));
    expect(status).toBe(415);
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("rechaza un archivo vacío etiquetado como PDF (415)", async () => {
    const { status } = await postFile("vacio.pdf", "application/pdf", pdfBuffer({ empty: true }));
    expect(status).toBe(415);
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("rechaza bytes no PDF con MIME PDF (415)", async () => {
    const { status } = await postFile("falso.pdf", "application/pdf", new TextEncoder().encode("html"));
    expect(status).toBe(415);
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("rechaza una imagen PNG con firma incorrecta (415)", async () => {
    const { status } = await postFile("falso.png", "image/png", new Uint8Array([1, 2, 3, 4]));
    expect(status).toBe(415);
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("rechaza un archivo sin el campo 'file' (400)", async () => {
    const form = new FormData();
    const req = new Request("http://localhost/api/upload", { method: "POST", body: form });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("rechaza un campo 'file' que no es un archivo (400)", async () => {
    const { status, body } = await postWithoutFile();
    expect(status).toBe(400);
    expect(body?.error).toBe("Se requiere un archivo.");
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("rechaza MIME no permitido (415)", async () => {
    const { status } = await postFile("nota.txt", "text/plain", new TextEncoder().encode("hola"));
    expect(status).toBe(415);
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("rechaza un archivo mayor a 25 MB (413)", async () => {
    const big = new Uint8Array(25 * 1024 * 1024 + 1);
    const { status, body } = await postFile("grande.pdf", "application/pdf", big);
    expect(status).toBe(413);
    expect(body?.error).toContain("25 MB");
    expect(mockedSave).not.toHaveBeenCalled();
  });
});