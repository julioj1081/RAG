export interface ManualExtracted {
  emisor?: string;
  receptor?: string;
  rfc?: string;
  fecha?: string;
  folio?: string;
  subtotal?: number | null;
  impuestos?: number | null;
  total?: number | null;
  moneda?: string;
  conceptos?: string[];
  otros?: string[];
}

function isFiniteAmount(v: string): boolean {
  const cleaned = v.trim().replace(/[,\s$]/g, "");
  if (!/^[-+]?\d*\.?\d+$/.test(cleaned)) return false;
  return Number.isFinite(parseFloat(cleaned));
}

const MANUAL_ALIASES: Record<string, keyof ManualExtracted> = {
  emisor: "emisor",
  emisora: "emisor",
  empresa: "emisor",
  proveedor: "emisor",
  vendedor: "emisor",
  vendedora: "emisor",
  "razon social": "emisor",
  "razón social": "emisor",
  receptor: "receptor",
  cliente: "receptor",
  comprador: "receptor",
  empleado: "receptor",
  "a nombre de": "receptor",
  rfc: "rfc",
  fecha: "fecha",
  "fecha de emision": "fecha",
  "fecha de emisión": "fecha",
  folio: "folio",
  "no. folio": "folio",
  "no folio": "folio",
  "numero de folio": "folio",
  "número de folio": "folio",
  moneda: "moneda",
  "tipo de moneda": "moneda",
  subtotal: "subtotal",
  impuestos: "impuestos",
  iva: "impuestos",
  total: "total",
  "total a pagar": "total",
  concepto: "conceptos",
  conceptos: "conceptos",
  descripcion: "conceptos",
  descripciones: "conceptos",
  partidas: "conceptos",
};

function normalizeManualKey(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

const STARTS_KEY = /^\s*#?\s*[^\s,:;#][^:#\n]*?\s*:/;

export function parseManualPairs(text: string): { key: string; value: string }[] {
  const pairs: { key: string; value: string }[] = [];
  const startKeyRe = /^[,;\s]*#?\s*([^\s,:;#][^:#\n]*?)\s*:/;
  const delimiterRe = /[\n,;#]/g;

  let src = text;
  while (src) {
    const hit = startKeyRe.exec(src);
    if (!hit) {
      const nl = src.indexOf("\n");
      if (nl === -1) break;
      src = src.slice(nl + 1);
      continue;
    }

    const key = hit[1].trim();
    const afterKey = src.slice(hit[0].length);

    let boundary = -1;
    delimiterRe.lastIndex = 0;
    let dm = delimiterRe.exec(afterKey);
    while (dm) {
      if (STARTS_KEY.test(afterKey.slice(dm.index + 1))) {
        boundary = dm.index;
        break;
      }
      dm = delimiterRe.exec(afterKey);
    }

    if (boundary === -1) {
      const value = afterKey.trim();
      if (value) pairs.push({ key, value });
      src = "";
    } else {
      const value = afterKey.slice(0, boundary).trim();
      if (value) pairs.push({ key, value });
      src = afterKey.slice(boundary);
    }
  }

  return pairs;
}

export function parseManual(text: string): ManualExtracted {
  const pairs = parseManualPairs(text);
  const conceptos: string[] = [];
  const otros: string[] = [];
  const store: Record<string, string> = {};

  for (const { key, value } of pairs) {
    const target = MANUAL_ALIASES[normalizeManualKey(key)];
    if (!target) {
      otros.push(`${key}: ${value}`);
      continue;
    }
    switch (target) {
      case "subtotal":
      case "impuestos":
      case "total":
        if (isFiniteAmount(value)) {
          store[target] = String(parseFloat(value.replace(/[,\s$]/g, "")));
        }
        break;
      case "moneda":
        store[target] = value.toUpperCase().slice(0, 3);
        break;
      case "conceptos":
        conceptos.push(value);
        break;
      case "emisor":
      case "receptor":
      case "rfc":
      case "fecha":
      case "folio":
        store[target] = value;
        break;
    }
  }

  const num = (k: string): number | null =>
    store[k] && store[k] !== "" ? parseFloat(store[k]) : null;

  return {
    emisor: store.emisor ?? "",
    receptor: store.receptor ?? "",
    rfc: store.rfc ?? "",
    fecha: store.fecha ?? "",
    folio: store.folio ?? "",
    conceptos,
    subtotal: num("subtotal"),
    impuestos: num("impuestos"),
    total: num("total"),
    moneda: store.moneda ?? "",
    otros,
  };
}