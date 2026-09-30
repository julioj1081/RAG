function normalizeWord(v: unknown): string {
  return String(v ?? "").replace(/[":,]/g, "").trim();
}

function parseAmount(v: string): number | null {
  const cleaned = v.replace(/,/g, "");
  const m = cleaned.match(/[-+]?\d+(?:\.\d{1,2})?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

export function parseTextFields(rawText: string): Record<string, unknown> {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim());

  const data: Record<string, unknown> = {
    emisor: "",
    receptor: "",
    rfc: "",
    fecha: "",
    folio: "",
    conceptos: [],
    subtotal: null,
    impuestos: null,
    total: null,
    moneda: "",
    otros: [],
  };

  for (const line of lines) {
    const low = line.toLowerCase();

    const emisor = line.match(
      /^(?:emisor|raz\s?on\s?social|empresa|vendedor|proveedor|cliente\s?\(emisor\)|expedido\s?por)\s*[:.\-]?\s*(.+)$/i
    );
    const receptor = line.match(
      /^(?:receptor|recibido\s?de|pagado\s?por|empleado)\s*[:.\-]?\s*(.+)$/i
    );

    const rfc = line.match(/\b[A-ZÑ&]{3,4}-?\d{6}-?[A-Z0-9]{3}\b/);
    const fecha = line.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
    const folio = line.match(/(?:^|[\s:])(?:no\.?|folio)[\s:.-]*\s*([\w\-]+)/i);
    const moneda = line.match(/\b(MXN|USD|EUR|COP|PEN|ARS|CLP)\b/i);
    const total = line.match(/^(?:total|importe\s?total|gran\s?total|amount)\s*[:=\-]?\s*\$?\s*([\d.,]+)/i);
    const subtotal = line.match(/^(?:subtotal|importe)\s*[:=\-]?\s*\$?\s*([\d.,]+)/i);
    const impuestos = line.match(/^(?:iva|isr|impuestos?)\s*[:=\-]?\s*(?:\d{1,3}\s*%\s*[:=\-]?\s*)?\$?\s*([\d.,]+)/i);

    if (emisor?.[1]) data.emisor = normalizeWord(emisor[1]);
    if (receptor?.[1]) data.receptor = normalizeWord(receptor[1]);
    if (rfc) data.rfc = rfc[0].replace(/[^\wÑñ&]/g, "").toUpperCase();
    if (fecha) data.fecha = `${fecha[1]}/${fecha[2]}/${fecha[3].length === 2 ? "20" + fecha[3] : fecha[3]}`;
    if (folio && !/(factura|recibo|nomina|contrato|documento|no\.)/.test(low)) {
      data.folio = folio[1].trim();
    }
    if (moneda) data.moneda = moneda[1].toUpperCase();
    if (total) data.total = parseAmount(total[1]);
    if (subtotal) data.subtotal = parseAmount(subtotal[1]);
    if (impuestos) data.impuestos = parseAmount(impuestos[1]);
  }

  const conceptos: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    const low = line.toLowerCase();
    if (/(total|subtotal|iva|impuesto|recibo|factura|fecha|emisor|receptor|rfc|folio|uuid|sello|configuracion|moneda)/.test(low)) {
      continue;
    }
    if (/(^|\s)(total|subtotal|iva)\s*[:\-=]/i.test(line)) continue;
    const amount = line.match(/[\d.,]+\s*$/);
    if (amount && line.length >= 6) {
      const parsed = parseAmount(amount[0].trim());
      const desc = line
        .slice(0, line.length - amount[0].length)
        .replace(/\s{2,}/g, " ")
        .trim();
      conceptos.push(parsed !== null && desc ? `${desc} — ${parsed}` : line);
    }
  }
  data.conceptos = conceptos.slice(0, 30);

  const otros: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    const low = line.toLowerCase();
    if (/(total|subtotal|iva|rfc|fecha|folio|emisor|receptor|concepto|cantidad|precio|moneda|uuid|formapago|metodopago)/.test(low)) {
      continue;
    }
    const pair = line.match(/^([\w\sÀ-ÿ&.\-]+)\s*[:=]\s*(.{2,})$/i);
    if (pair && pair[1].trim().length >= 3 && !/^\d/.test(pair[1].trim())) {
      otros.push(`${pair[1].trim()}: ${pair[2].trim()}`);
    }
    if (otros.length >= 15) break;
  }
  data.otros = otros;

  return data;
}