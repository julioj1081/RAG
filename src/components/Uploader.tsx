"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Chat from "./Chat";
import { parseManual, parseManualPairs } from "@/lib/manual";
interface ExtractedData {
  emisor?: string;
  receptor?: string;
  rfc?: string;
  fecha?: string;
  folio?: string;
  conceptos?: string[];
  subtotal?: number | null;
  impuestos?: number | null;
  total?: number | null;
  moneda?: string;
  otros?: string[];
  [key: string]: unknown;
}
interface AnalysisResult {
  provider: string | null;
  model: string | null;
  document_type: string;
  confidence: number | null;
  extracted: ExtractedData | null;
  raw_text: string | null;
  error: string | null;
  validated?: boolean | null;
}
interface UploadedFile {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  doc_type: string | null;
  extracted_json: ExtractedData | null;
  validated: boolean;
}
interface ScanProgress {
  done: number;
  total: number;
}
type AnalysisState =
  | { status: "none"; result: null; error: null }
  | {
      status: "loading";
      result: null;
      error: null;
      mode: "load" | "scan";
      progress: ScanProgress | null;
    }
  | { status: "done"; result: AnalysisResult | null; error: null }
  | { status: "error"; result: null; error: string };
const ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml,image/heic,image/heif,application/pdf,.pdf";
const TYPE_LABELS: Record<string, string> = {
  factura: "Factura",
  recibo: "Recibo",
  nomina: "Nómina",
  contrato: "Contrato",
  otros: "Otros",
};
const DOC_TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}
function isPdfMime(mime: string, name: string): boolean {
  return mime === "application/pdf" || name.toLowerCase().endsWith(".pdf");
}
function mimeOf(f: { name: string; type: string }): string {
  if (f.type) return f.type;
  const name = f.name.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".bmp")) return "image/bmp";
  if (name.endsWith(".svg")) return "image/svg+xml";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  if (name.endsWith(".pdf")) return "application/pdf";
  return "image/png";
}
function PdfIcon() {
  return (
    <svg
      width="18"
      height="16"
      viewBox="0 0 576 512"
      fill="currentColor"
      aria-hidden="true"
    >
      {" "}
      <path d="M96 0C60.7 0 32 28.7 32 64l0 384c0 35.3 28.7 64 64 64l80 0 0-112c0-35.3 28.7-64 64-64l176 0 0-165.5c0-17-6.7-33.3-18.7-45.3L290.7 18.7C278.7 6.7 262.5 0 245.5 0L96 0zM357.5 176L264 176c-13.3 0-24-10.7-24-24L240 58.5 357.5 176zM240 380c-11 0-20 9-20 20l0 128c0 11 9 20 20 20s20-9 20-20l0-28 12 0c33.1 0 60-26.9 60-60s-26.9-60-60-60l-32 0zm32 80l-12 0 0-40 12 0c11 0 20 9 20 20s-9 20-20 20zm96-80c-11 0-20 9-20 20l0 128c0 11 9 20 20 20l32 0c28.7 0 52-23.3 52-52l0-64c0-28.7-23.3-52-52-52l-32 0zm20 128l0-88 12 0c6.6 0 12 5.4 12 12l0 64c0 6.6-5.4 12-12 12l-12 0zm88-108l0 128c0 11 9 20 20 20s20-9 20-20l0-44 28 0c11 0 20-9 20-20s-9-20-20-20l-28 0 0-24 28 0c11 0 20-9 20-20s-9-20-20-20l-48 0c-11 0-20 9-20 20z" />{" "}
    </svg>
  );
}
function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
function summarizeExtracted(e: ExtractedData | null | undefined): string {
  if (!e) return "";
  const bits: string[] = [];
  if (e.emisor) bits.push(String(e.emisor));
  if (e.total != null) {
    bits.push(`Total: ${e.total}${e.moneda ? ` ${e.moneda}` : ""}`);
  }
  return bits.join(" · ");
}
/* --- Editable extracted fields: validation + draft helpers --- */ interface FieldDef {
  key: keyof ExtractedData;
  label: string;
  kind: "text" | "number" | "lines";
  validate: (value: string, index: number, draft: string[]) => boolean;
}
function isValidDate(v: string): boolean {
  const m = v.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (!m) return false;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(year, month, 0).getDate();
}
function isFiniteAmount(v: string): boolean {
  const cleaned = v.trim().replace(/[,\s$]/g, "");
  if (!/^[-+]?\d*\.?\d+$/.test(cleaned)) return false;
  return Number.isFinite(parseFloat(cleaned));
}
function formatAmount(v: string): string {
  const cleaned = v.trim().replace(/[,\s$]/g, "");
  if (cleaned === "" || !isFiniteAmount(cleaned)) return v;
  const n = parseFloat(cleaned);
  const frac = cleaned.includes(".") ? (cleaned.split(".")[1] ?? "") : "";
  const digits = frac.length > 0 ? Math.min(frac.length, 2) : 0;
  try {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: Math.max(digits, 2),
    }).format(n);
  } catch {
    return v;
  }
}
const FIELD_DEFS: FieldDef[] = [
  {
    key: "emisor",
    label: "Emisor",
    kind: "text",
    validate: (v) => v.trim().length > 0,
  },
  {
    key: "receptor",
    label: "Receptor",
    kind: "text",
    validate: (v) => v.trim().length > 0,
  },
  {
    key: "rfc",
    label: "RFC",
    kind: "text",
    validate: (v) =>
      v.trim() === "" || /^[A-ZÑ&]{3,4}-?\d{6}-?[A-Z0-9]{3}$/i.test(v.trim()),
  },
  {
    key: "fecha",
    label: "Fecha (dd/mm/aaaa)",
    kind: "text",
    validate: (v) => v.trim() === "" || isValidDate(v.trim()),
  },
  { key: "folio", label: "Folio", kind: "text", validate: () => true },
  {
    key: "moneda",
    label: "Moneda",
    kind: "text",
    validate: (v) =>
      v.trim() === "" || /^[A-Z]{3}$/.test(v.trim().toUpperCase()),
  },
  {
    key: "subtotal",
    label: "Subtotal",
    kind: "number",
    validate: (v) => v.trim() === "" || isFiniteAmount(v),
  },
  {
    key: "impuestos",
    label: "Impuestos",
    kind: "number",
    validate: (v) => v.trim() === "" || isFiniteAmount(v),
  },
  {
    key: "total",
    label: "Total",
    kind: "number",
    validate: (v, _i, draft) => {
      const hasParts = draft[6].trim() !== "" || draft[7].trim() !== "";
      if (hasParts && v.trim() === "") return false;
      return v.trim() === "" || isFiniteAmount(v);
    },
  },
  { key: "conceptos", label: "Conceptos", kind: "lines", validate: () => true },
  { key: "otros", label: "Otros campos", kind: "lines", validate: () => true },
];
function extractedToDraft(initial: ExtractedData | null | undefined): string[] {
  return FIELD_DEFS.map((def) => {
    const v = initial?.[def.key];
    if (def.kind === "lines") {
      return Array.isArray(v) ? (v as string[]).join("\n") : "";
    }
    return v == null ? "" : String(v);
  });
}
function draftToExtracted(draft: string[]): ExtractedData {
  const txt = (i: number): string => draft[i]?.trim() ?? "";
  const num = (i: number): number | null => {
    const t = txt(i);
    return t === "" ? null : parseFloat(t.replace(/[,\s$]/g, ""));
  };
  const lines = (i: number): string[] =>
    (draft[i] ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  return {
    emisor: txt(0),
    receptor: txt(1),
    rfc: txt(2),
    fecha: txt(3),
    folio: txt(4),
    conceptos: lines(9),
    subtotal: num(6),
    impuestos: num(7),
    total: num(8),
    moneda: txt(5).toUpperCase(),
    otros: lines(10),
  };
}
function fieldError(
  def: FieldDef,
  value: string,
  index: number,
  draft: string[],
): string {
  switch (def.key) {
    case "emisor":
    case "receptor":
      return "Campo obligatorio";
    case "rfc":
      return "RFC no válido (formato: AAA 000000 AAA)";
    case "fecha":
      return "Fecha no válida (dd/mm/aaaa)";
    case "moneda":
      return "Código de moneda no válido (3 letras, ej. MXN)";
    case "total":
      return draft[6].trim() !== "" &&
        draft[7].trim() === "" &&
        value.trim() === ""
        ? "Falta el total"
        : "Importe no válido";
    case "subtotal":
    case "impuestos":
      return "Importe no válido";
    default:
      return def.validate(value, index, draft) ? "" : "Valor no válido";
  }
}
function AnalysisBody({
  analysis,
  onAnalyze,
  onRetry,
  onReanalyze,
  onSaved,
  onManualSave,
  onTypeChange,
  fileDocType,
}: {
  analysis: AnalysisState;
  onAnalyze: () => void;
  onRetry: () => void;
  onReanalyze: () => void;
  onSaved: (payload: ExtractedData) => Promise<void>;
  onManualSave: (payload: ExtractedData) => Promise<void>;
  onTypeChange: (docType: string) => Promise<void>;
  fileDocType: string | null;
}) {
  const currentType =
    analysis.status === "done"
      ? (analysis.result?.document_type ?? "")
      : analysis.status === "none"
        ? (fileDocType ?? "otros")
        : "";
  const [savingType, setSavingType] = useState(false);
  const [manual, setManual] = useState(false);
  const changeType = useCallback(
    async (t: string) => {
      if (t === currentType) return;
      setSavingType(true);
      try {
        await onTypeChange(t);
      } catch {
        /* el select revierte solo al valor anterior */
      } finally {
        setSavingType(false);
      }
    },
    [currentType, onTypeChange],
  );
  if (analysis.status === "loading") {
    const scanning = analysis.mode === "scan";
    const progress = analysis.progress;
    const pct =
      progress && progress.total > 0
        ? Math.min(100, Math.round((progress.done / progress.total) * 100))
        : null;
    const label = scanning
      ? pct != null && progress
        ? `Escaneando página ${progress.done} de ${progress.total} con deepseek-ocr (Ollama)...`
        : "Escaneando documento con deepseek-ocr (Ollama)..."
      : "Cargando análisis...";
    return (
      <div className="analysis-loading">
        {" "}
        <div className="analysis-loading-row">
          {" "}
          <span className="spinner" /> <span>{label}</span>{" "}
        </div>{" "}
        {scanning && (
          <div className="progress">
            {" "}
            <div className="progress-track">
              {" "}
              <div
                className={`progress-fill${pct == null ? " indeterminate" : ""}`}
                style={
                  pct != null ? { width: `${Math.max(8, pct)}%` } : undefined
                }
              />{" "}
            </div>{" "}
            <span className="progress-pct">
              {pct != null ? `${pct}%` : "Estimando..."}
            </span>{" "}
          </div>
        )}{" "}
      </div>
    );
  }
  if (analysis.status === "none") {
    if (manual) {
      return (
        <ManualEntry onSave={onManualSave} onCancel={() => setManual(false)} />
      );
    }
    return (
      <div className="analysis-empty">
        {" "}
        <select
          className={`doc-type-select type-${currentType}`}
          value={currentType}
          disabled={savingType}
          onChange={(e) => changeType(e.target.value)}
          title="Tipo de documento"
        >
          {" "}
          {DOC_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {" "}
              {o.label}{" "}
            </option>
          ))}{" "}
        </select>{" "}
        <p>Este documento todavía no se ha analizado.</p>{" "}
        <div className="analysis-actions">
          {" "}
          <button className="btn primary" onClick={onAnalyze}>
            {" "}
            Analizar documento{" "}
          </button>{" "}
          <button className="btn secondary" onClick={() => setManual(true)}>
            {" "}
            Llenar manualmente{" "}
          </button>{" "}
        </div>{" "}
      </div>
    );
  }
  const renderError = (msg: string) => {
    if (manual) {
      return (
        <ManualEntry onSave={onManualSave} onCancel={() => setManual(false)} />
      );
    }
    return (
      <div>
        {" "}
        <p className="analysis-error">{msg}</p>{" "}
        <div className="analysis-actions">
          {" "}
          <button className="btn small secondary" onClick={onRetry}>
            {" "}
            Reintentar{" "}
          </button>{" "}
          <button
            className="btn small secondary"
            onClick={() => setManual(true)}
          >
            {" "}
            Cancelar y llenar manualmente{" "}
          </button>{" "}
        </div>{" "}
      </div>
    );
  };
  if (analysis.status === "error") {
    return renderError(analysis.error);
  }
  const result = analysis.result;
  if (result?.error) {
    return renderError(result.error);
  }
  if (!result) {
    if (manual) {
      return (
        <ManualEntry onSave={onManualSave} onCancel={() => setManual(false)} />
      );
    }
    return (
      <div>
        {" "}
        <p className="no-json">
          No se pudo extraer contenido del documento.
        </p>{" "}
        <div className="analysis-actions">
          {" "}
          <button
            className="btn small secondary"
            onClick={() => setManual(true)}
          >
            {" "}
            Llenar manualmente{" "}
          </button>{" "}
        </div>{" "}
      </div>
    );
  }
  return (
    <div>
      {" "}
      <div className="analysis-head">
        {" "}
        <select
          className={`doc-type-select type-${result.document_type}`}
          value={result.document_type}
          disabled={savingType}
          onChange={(e) => changeType(e.target.value)}
          title="Tipo de documento"
        >
          {" "}
          {DOC_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {" "}
              {o.label}{" "}
            </option>
          ))}{" "}
        </select>{" "}
        {typeof result.confidence === "number" && (
          <span className="confidence">
            Confianza: {(result.confidence * 100).toFixed(0)}%
          </span>
        )}{" "}
        <span className={`status-badge ${result.validated ? "ok" : "pending"}`}>
          {" "}
          {result.validated ? "Validado" : "Pendiente de validar"}{" "}
        </span>{" "}
        <span className="provider">
          {" "}
          {result.provider} / {result.model}{" "}
        </span>{" "}
      </div>{" "}
      <div className="analysis-actions">
        {" "}
        <button className="btn small secondary" onClick={onReanalyze}>
          {" "}
          Re-analizar{" "}
        </button>{" "}
        <button className="btn small secondary" onClick={() => setManual(true)}>
          {" "}
          Llenar manualmente{" "}
        </button>{" "}
      </div>{" "}
      {manual ? (
        <ManualEntry onSave={onManualSave} onCancel={() => setManual(false)} />
      ) : result.extracted ? (
        <EditableExtracted
          key={prettyJson(result.extracted)}
          initial={result.extracted}
          onSaved={onSaved}
          onReset={() => onReanalyze()}
        />
      ) : result.raw_text ? (
        <>
          {" "}
          <p className="no-json">
            El modelo no devolvió JSON estructurado, se muestra el texto OCR:
          </p>{" "}
          <pre className="json-box">{result.raw_text}</pre>{" "}
        </>
      ) : (
        <p className="no-json">No se pudo extraer contenido del documento.</p>
      )}{" "}
    </div>
  );
}
function EditableExtracted({
  initial,
  onSaved,
  onReset,
}: {
  initial: ExtractedData;
  onSaved: (payload: ExtractedData) => Promise<void>;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<string[]>(() => extractedToDraft(initial));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const setValue = (index: number, value: string) => {
    setDraft((d) => {
      const next = [...d];
      next[index] = value;
      return next;
    });
    setDirty(true);
  };
  const fieldValid = FIELD_DEFS.map((def, i) =>
    def.validate(draft[i], i, draft),
  );
  const invalidCount = fieldValid.filter((v) => !v).length;
  const ready = invalidCount === 0;
  const save = async () => {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      await onSaved(draftToExtracted(draft));
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="extracted-form">
      {" "}
      <div className="extracted-summary">
        {" "}
        {ready ? (
          <span className="field-ok">Todos los campos son válidos</span>
        ) : (
          <span className="field-bad">
            {" "}
            {invalidCount} campo{invalidCount === 1 ? "" : "s"} con errores{" "}
          </span>
        )}{" "}
      </div>{" "}
      <div className="row g-3">
        {" "}
        {FIELD_DEFS.map((def, i) => {
          const valid = fieldValid[i];
          const msg = valid ? null : fieldError(def, draft[i], i, draft);
          const span = def.kind === "lines" ? "col-12" : "col-md-6";
          const inputProps = {
            id: `field-${def.key}`,
            value: draft[i],
            disabled: saving,
            onChange: (
              e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
            ) => setValue(i, e.target.value),
          };
          const numberProps =
            def.kind === "number"
              ? {
                  value: focused === i ? draft[i] : formatAmount(draft[i]),
                  onFocus: () => setFocused(i),
                  onBlur: () => {
                    setFocused(null);
                    if (def.kind === "number") {
                      const f = formatAmount(draft[i]);
                      if (f !== draft[i]) {
                        setDraft((d) => {
                          const next = [...d];
                          next[i] = f;
                          return next;
                        });
                        setDirty(true);
                      }
                    }
                  },
                }
              : {};
          return (
            <div
              key={def.key}
              className={`extracted-field ${span}${valid ? "" : " invalid"}`}
            >
              {" "}
              <label htmlFor={`field-${def.key}`}>{def.label}</label>{" "}
              {def.kind === "lines" ? (
                <textarea
                  rows={Math.max(3, Math.min(8, draft[i].split("\n").length))}
                  {...inputProps}
                />
              ) : (
                <input
                  type="text"
                  inputMode={def.kind === "number" ? "decimal" : undefined}
                  {...inputProps}
                  {...numberProps}
                />
              )}{" "}
              {msg && <span className="field-error">{msg}</span>}{" "}
            </div>
          );
        })}{" "}
      </div>{" "}
      {error && <p className="status error">{error}</p>}{" "}
      <div className="analysis-actions">
        {" "}
        <button
          className="btn primary"
          type="button"
          onClick={save}
          disabled={saving || !dirty || !ready}
        >
          {" "}
          {saving ? "Guardando..." : "Guardar cambios"}{" "}
        </button>{" "}
        {dirty && (
          <button
            className="btn secondary"
            type="button"
            disabled={saving}
            onClick={onReset}
          >
            {" "}
            Re-analizar{" "}
          </button>
        )}{" "}
      </div>{" "}
    </div>
  );
}
function ManualEntry({
  onSave,
  onCancel,
}: {
  onSave: (payload: ExtractedData) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const save = async () => {
    const parsed = parseManualPairs(text);
    if (parsed.length === 0) {
      setError("Escribe al menos un campo con formato: clave: valor");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = parseManual(text);
      const emptyFields =
        (!payload.emisor ? 1 : 0) +
        (!payload.receptor ? 1 : 0) +
        ((payload.conceptos?.length ?? 0) === 0 &&
        (payload.otros?.length ?? 0) === 0
          ? 1
          : 0);
      await onSave(payload as ExtractedData);
      setSavedCount(parsed.length);
      setError(
        emptyFields > 0
          ? `Guardado en la base de datos. Sugerencia: añade emisor, receptor o conceptos para una mejor clasificación.`
          : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="manual-entry">
      {" "}
      <p className="manual-hint">
        {" "}
        Escribe los datos perdidos del documento con formato{" "}
        <code>clave: valor</code>. Claves conocidas: <code>emisor</code>,{" "}
        <code>receptor</code>, <code>rfc</code>, <code>fecha</code>,{" "}
        <code>folio</code>, <code>moneda</code>, <code>subtotal</code>,{" "}
        <code>impuestos</code>, <code>total</code>, <code>conceptos</code>.
        Cualquier otra clave (prefijada opcionalmente con <code>#</code>) se
        guarda como metadato {"{otros}"}.{" "}
      </p>{" "}
      <textarea
        className="manual-input"
        rows={8}
        value={text}
        disabled={saving}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          "#sueldo: 10,300\n#moneda: MX\nDireccion: Paseos del jardin\ncomentarios: Contrato firmado el dia 15"
        }
      />{" "}
      <div className="analysis-actions">
        {" "}
        <button
          className="btn primary"
          type="button"
          onClick={save}
          disabled={saving || !text.trim()}
        >
          {" "}
          {saving ? "Guardando..." : "Guardar manualmente"}{" "}
        </button>{" "}
        <button
          className="btn secondary"
          type="button"
          disabled={saving}
          onClick={onCancel}
        >
          {" "}
          Volver{" "}
        </button>{" "}
      </div>{" "}
      {savedCount != null && !error && (
        <p className="status success">
          {savedCount} campos guardados en la base de datos.
        </p>
      )}{" "}
      {error && (
        <p
          className={`status ${savedCount != null && !error.includes("Sugerencia") ? "success" : "error"}`}
        >
          {error}
        </p>
      )}{" "}
    </div>
  );
}
export default function Uploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<{
    kind: "info" | "success" | "error";
    msg: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, AnalysisState>>({});
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const loadFiles = useCallback(async (): Promise<UploadedFile[]> => {
    try {
      const res = await fetch("/api/files");
      if (!res.ok) return [];
      const data = await res.json();
      const list = (data.files ?? []) as UploadedFile[];
      setFiles(list);
      return list;
    } catch {
      return [];
    }
  }, []);
  useEffect(() => {
    loadFiles();
  }, [loadFiles]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);
  const currentFile = files.find((f) => f.id === openFileId) ?? null;
  const openAnalysis: AnalysisState | null = currentFile
    ? (analyses[currentFile.id] ?? {
        status: "none",
        result: null,
        error: null,
      })
    : null;
  const scanning = useCallback(
    (id: string) => analyses[id]?.status === "loading",
    [analyses],
  );
  useEffect(() => {
    if (openAnalysis?.status === "done" && viewerRef.current) {
      viewerRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [openFileId, openAnalysis?.status]);
  const openFile = useCallback(
    (file: UploadedFile) => {
      setOpenFileId(file.id);
      const cur = analyses[file.id];
      if (cur && cur.status === "loading" && cur.mode === "scan") return;
      if (cur && cur.status !== "none") return;
      setAnalyses((m) => ({
        ...m,
        [file.id]: {
          status: "loading",
          result: null,
          error: null,
          mode: "load",
          progress: null,
        },
      }));
      (async () => {
        try {
          const res = await fetch(`/api/classify/${file.id}`);
          if (res.status === 404) {
            setAnalyses((m) => {
              const cur = m[file.id];
              if (cur && cur.status === "loading" && cur.mode === "load") {
                return {
                  ...m,
                  [file.id]: { status: "none", result: null, error: null },
                };
              }
              return m;
            });
            return;
          }
          const data = await res.json();
          if (!res.ok)
            throw new Error(data.error ?? "Error al cargar el análisis");
          setAnalyses((m) => {
            const cur = m[file.id];
            if (cur && cur.status === "loading" && cur.mode === "load") {
              return {
                ...m,
                [file.id]: {
                  status: "done",
                  result: data as AnalysisResult,
                  error: null,
                },
              };
            }
            return m;
          });
        } catch (err) {
          setAnalyses((m) => {
            const cur = m[file.id];
            if (cur && cur.status === "loading" && cur.mode === "load") {
              return {
                ...m,
                [file.id]: {
                  status: "error",
                  result: null,
                  error:
                    err instanceof Error ? err.message : "Error inesperado",
                },
              };
            }
            return m;
          });
        }
      })();
    },
    [analyses],
  );
  const runAnalysis = useCallback(
    async (file: UploadedFile) => {
      setAnalyses((m) => ({
        ...m,
        [file.id]: {
          status: "loading",
          result: null,
          error: null,
          mode: "scan",
          progress: null,
        },
      }));
      const updateProgress = (progress: ScanProgress) => {
        setAnalyses((m) => {
          const cur = m[file.id];
          if (!cur || cur.status !== "loading" || cur.mode !== "scan") return m;
          return { ...m, [file.id]: { ...cur, progress } };
        });
      };
      try {
        const res = await fetch(`/api/classify/${file.id}`, { method: "POST" });
        if (!res.body) {
          const data = await res.json().catch(() => null);
          if (!res.ok)
            throw new Error(data?.error ?? "Fallo al analizar el documento");
          throw new Error("El servidor no soporta el análisis por streaming.");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalResult: AnalysisResult | null = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            let evt: { type?: string } & Record<string, unknown>;
            try {
              evt = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            if (
              evt.type === "progress" &&
              typeof evt.done === "number" &&
              typeof evt.total === "number"
            ) {
              updateProgress({ done: evt.done, total: evt.total });
            } else if (evt.type === "result") {
              finalResult = (evt.result as AnalysisResult) ?? null;
            } else if (evt.type === "error") {
              throw new Error(
                String(evt.message ?? "Fallo al analizar el documento"),
              );
            }
          }
        }
        if (!finalResult) {
          throw new Error("No se recibió el resultado del análisis.");
        }
        await loadFiles();
        setAnalyses((m) => {
          const cur = m[file.id];
          if (!cur || cur.status !== "loading" || cur.mode !== "scan") return m;
          return {
            ...m,
            [file.id]: {
              status: "done",
              result: { ...finalResult, validated: false },
              error: null,
            },
          };
        });
      } catch (err) {
        setAnalyses((m) => {
          const cur = m[file.id];
          if (!cur || cur.status !== "loading" || cur.mode !== "scan") return m;
          return {
            ...m,
            [file.id]: {
              status: "error",
              result: null,
              error: err instanceof Error ? err.message : "Error inesperado",
            },
          };
        });
      }
    },
    [loadFiles],
  );
  const deleteFile = useCallback(
    async (file: UploadedFile) => {
      const res = await fetch(`/api/files/${file.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok)
        throw new Error(data?.error ?? "No se pudo eliminar el archivo.");
      await loadFiles();
      setAnalyses((m) => {
        const next = { ...m };
        delete next[file.id];
        return next;
      });
      setOpenFileId((id) => (id === file.id ? null : id));
    },
    [loadFiles],
  );
  const saveExtracted = useCallback(
    async (id: string, payload: ExtractedData) => {
      const res = await fetch(`/api/files/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extracted: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "No se pudo guardar.");
      }
      await loadFiles();
      setAnalyses((m) => {
        const cur = m[id];
        if (!cur || cur.status !== "done" || !cur.result) return m;
        return {
          ...m,
          [id]: {
            ...cur,
            result: { ...cur.result, extracted: payload, validated: true },
          },
        };
      });
    },
    [loadFiles],
  );
  const updateDocumentType = useCallback(
    async (id: string, docType: string) => {
      const res = await fetch(`/api/files/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_type: docType }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "No se pudo actualizar el tipo.");
      }
      await loadFiles();
      setAnalyses((m) => {
        const cur = m[id];
        if (!cur || cur.status !== "done" || !cur.result) return m;
        return {
          ...m,
          [id]: { ...cur, result: { ...cur.result, document_type: docType } },
        };
      });
    },
    [loadFiles],
  );
  const openById = useCallback(
    (id: string) => {
      const file = files.find((f) => f.id === id);
      if (file) openFile(file);
    },
    [files, openFile],
  );
  const selectFile = useCallback((file: File | undefined | null) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    const okExt = /\.(png|jpe?g|webp|gif|bmp|svg|heic|heif|pdf)$/.test(name);
    const okMime =
      /^image\//.test(file.type) || file.type === "application/pdf";
    if (!okMime && !okExt) {
      setStatus({
        kind: "error",
        msg: "Solo se permiten imágenes (PNG, JPEG, WEBP, GIF, BMP, SVG, HEIC) o PDF.",
      });
      return;
    }
    setStatus(null);
    setSelected(file);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
  }, []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      selectFile(e.dataTransfer.files?.[0]);
    },
    [selectFile],
  );
  const onUpload = async () => {
    if (!selected) return;
    setUploading(true);
    setStatus(null);
    const form = new FormData();
    form.append("file", selected);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setStatus({
          kind: "error",
          msg: data.error ?? "No se pudo subir el archivo.",
        });
        return;
      }
      setStatus({
        kind: "success",
        msg: "Archivo subido. Analizando con deepseek-ocr (Ollama)...",
      });
      setSelected(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      if (inputRef.current) inputRef.current.value = "";
      setShowDrop(false);
      const uploaded: UploadedFile = {
        id: data.id as string,
        filename: selected.name,
        mime_type: mimeOf(selected),
        size_bytes: selected.size,
        created_at: new Date().toISOString(),
        doc_type: null,
        extracted_json: null,
        validated: false,
      };
      await loadFiles();
      setOpenFileId(uploaded.id);
      await runAnalysis(uploaded);
    } catch {
      setStatus({ kind: "error", msg: "Error de conexión con el servidor." });
    } finally {
      setUploading(false);
    }
  };
  const reset = () => {
    setSelected(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setStatus(null);
    if (inputRef.current) inputRef.current.value = "";
  };
  useEffect(() => {
    const onOpen = () => setShowDrop(true);
    window.addEventListener("open-upload", onOpen);
    return () => window.removeEventListener("open-upload", onOpen);
  }, []);
  const closeDrop = () => setShowDrop(false);
  useEffect(() => {
    if (!showDrop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showDrop]);
  return (
    <>
      {" "}
      {mounted &&
        showDrop &&
        createPortal(
          <div className="dropzone-modal" onClick={closeDrop}>
            {" "}
            <div
              className="dropzone-modal-card"
              onClick={(e) => e.stopPropagation()}
            >
              {" "}
              <div className="dropzone-modal-head">
                {" "}
                <h3>Subir archivo</h3>{" "}
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={closeDrop}
                >
                  {" "}
                  Cerrar{" "}
                </button>{" "}
              </div>{" "}
              <div
                className={`dropzone${dragging ? " dragging" : ""}`}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                role="button"
                aria-label="Subir archivo"
              >
                {" "}
                <svg
                  width="42"
                  height="42"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {" "}
                  <path d="M12 16V4" /> <path d="m6 10 6-6 6 6" />{" "}
                  <path d="M4 20h16" />{" "}
                </svg>{" "}
                <h4>Arrastra y suelta tu archivo aquí</h4>{" "}
                <p>o haz clic para seleccionar · Imágenes o PDF hasta 25 MB</p>{" "}
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  onChange={(e) => selectFile(e.target.files?.[0])}
                />{" "}
              </div>{" "}
              {selected && previewUrl && (
                <div className="preview">
                  {" "}
                  <h5>Vista previa</h5>{" "}
                  <div className="preview-box">
                    {" "}
                    {isPdf(selected) ? (
                      <iframe src={previewUrl} title="Vista previa del PDF" />
                    ) : (
                      <img src={previewUrl} alt="Vista previa" />
                    )}{" "}
                  </div>{" "}
                  <div className="preview-meta">
                    {" "}
                    <span className="name">{selected.name}</span>{" "}
                    <span className="size">
                      {formatBytes(selected.size)}
                    </span>{" "}
                  </div>{" "}
                  <div className="preview-actions">
                    {" "}
                    <button
                      className="btn primary"
                      disabled={uploading}
                      onClick={onUpload}
                    >
                      {" "}
                      {uploading ? "Subiendo..." : "Subir archivo"}{" "}
                    </button>{" "}
                    <button
                      className="btn secondary"
                      disabled={uploading}
                      onClick={reset}
                    >
                      {" "}
                      Descartar{" "}
                    </button>{" "}
                  </div>{" "}
                </div>
              )}{" "}
              {status && (
                <p className={`status ${status.kind}`}>{status.msg}</p>
              )}{" "}
            </div>{" "}
          </div>,
          document.body,
        )}{" "}
      {currentFile && openAnalysis && (
        <div ref={viewerRef} className="viewer card-style">
          {" "}
          <div className="viewer-head">
            {" "}
            <h4>
              {" "}
              <code>{currentFile.filename}</code>
              <span className="fmeta">
                {formatBytes(currentFile.size_bytes)}
              </span>{" "}
            </h4>{" "}
            <button
              className="btn small secondary"
              onClick={() => setOpenFileId(null)}
            >
              {" "}
              Cerrar{" "}
            </button>{" "}
          </div>{" "}
          <div className="viewer-grid row g-4">
            {" "}
            <div className="viewer-doc col-md-8">
              {" "}
              {isPdfMime(currentFile.mime_type, currentFile.filename) ? (
                <iframe
                  src={`/api/files/${currentFile.id}`}
                  title={currentFile.filename}
                />
              ) : (
                <img
                  src={`/api/files/${currentFile.id}`}
                  alt={currentFile.filename}
                />
              )}{" "}
              {openAnalysis.status === "loading" && (
                <div className="viewer-loading">
                  {" "}
                  <span className="spinner large" />{" "}
                  <span>
                    {" "}
                    {openAnalysis.mode === "scan"
                      ? openAnalysis.progress && openAnalysis.progress.total > 0
                        ? `Escaneando página ${openAnalysis.progress.done} de ${openAnalysis.progress.total}`
                        : "Escaneando documento..."
                      : "Cargando documento..."}{" "}
                  </span>{" "}
                </div>
              )}{" "}
            </div>{" "}
            <div className="viewer-data col-md-4">
              {" "}
              <h4 className="viewer-data-title">Datos extraídos</h4>{" "}
              <AnalysisBody
                analysis={openAnalysis}
                onAnalyze={() => runAnalysis(currentFile)}
                onRetry={() => runAnalysis(currentFile)}
                onReanalyze={() => runAnalysis(currentFile)}
                onSaved={(payload) => saveExtracted(currentFile.id, payload)}
                onManualSave={(payload) =>
                  saveExtracted(currentFile.id, payload)
                }
                onTypeChange={(t) => updateDocumentType(currentFile.id, t)}
                fileDocType={currentFile.doc_type}
              />{" "}
            </div>{" "}
          </div>{" "}
        </div>
      )}{" "}
      <div className="files">
        {" "}
        <h2>Archivos guardados</h2>{" "}
        {files.length === 0 ? (
          <p className="file-empty">Todavía no hay archivos.</p>
        ) : (
          files.map((f) => (
            <div
              key={f.id}
              className="file-item clickable"
              onClick={() => openFile(f)}
            >
              {" "}
              <div className="row g-3 align-items-center w-100">
                {" "}
                <div className="col-12 col-md">
                  {" "}
                  <div className="file-left">
                    {" "}
                    {f.mime_type.startsWith("image/") ? (
                      <img
                        className="file-thumb"
                        src={`/api/files/${f.id}`}
                        alt={f.filename}
                      />
                    ) : (
                      <a
                        className="file-type-badge"
                        href={`/api/files/${f.id}`}
                        download={f.filename}
                        title="Descargar archivo"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {" "}
                        <PdfIcon />{" "}
                      </a>
                    )}{" "}
                    <div className="file-info">
                      {" "}
                      <span className="fname">{f.filename}</span>{" "}
                      {scanning(f.id) && (
                        <span className="file-scanning">
                          {" "}
                          <span className="spinner tiny" /> Escaneando…{" "}
                        </span>
                      )}{" "}
                      {f.extracted_json &&
                        summarizeExtracted(f.extracted_json) && (
                          <span className="file-data-lines">
                            {" "}
                            {summarizeExtracted(f.extracted_json)}{" "}
                          </span>
                        )}{" "}
                      {f.extracted_json && (
                        <span
                          className={`file-status ${f.validated ? "ok" : "pending"}`}
                        >
                          {" "}
                          {f.validated ? "Validado" : "Pendiente"}{" "}
                        </span>
                      )}{" "}
                    </div>{" "}
                    {f.doc_type && TYPE_LABELS[f.doc_type] && (
                      <span className={`tag tag-${f.doc_type}`}>
                        {" "}
                        {TYPE_LABELS[f.doc_type]}{" "}
                      </span>
                    )}{" "}
                  </div>{" "}
                </div>{" "}
                <div className="col-12 col-md-auto">
                  {" "}
                  <div className="file-actions">
                    {" "}
                    <span className="fmeta">
                      {formatBytes(f.size_bytes)}
                    </span>{" "}
                    <button
                      className="btn btn-sm small"
                      disabled={scanning(f.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        openFile(f);
                      }}
                    >
                      {" "}
                      Ver{" "}
                    </button>{" "}
                    <button
                      className="btn btn-sm small secondary"
                      disabled={scanning(f.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        runAnalysis(f);
                      }}
                    >
                      {" "}
                      {scanning(f.id)
                        ? "Escaneando..."
                        : f.doc_type
                          ? "Re-analizar"
                          : "Analizar"}{" "}
                    </button>{" "}
                    <button
                      className="btn btn-sm small danger"
                      disabled={scanning(f.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`¿Eliminar "${f.filename}"?`)) {
                          deleteFile(f).catch((err) =>
                            setStatus({
                              kind: "error",
                              msg:
                                err instanceof Error
                                  ? err.message
                                  : "No se pudo eliminar.",
                            }),
                          );
                        }
                      }}
                    >
                      {" "}
                      Eliminar{" "}
                    </button>{" "}
                  </div>{" "}
                </div>{" "}
              </div>{" "}
            </div>
          ))
        )}{" "}
      </div>{" "}
      {mounted &&
        createPortal(
          <Chat
            onOpenDocument={openById}
            recentFiles={files.map((f) => ({
              filename: f.filename,
              doc_type: f.doc_type,
              extracted: f.extracted_json,
            }))}
          />,
          document.body,
        )}{" "}
    </>
  );
}
