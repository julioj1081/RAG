export function DownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4v12M6 10l6 6 6-6M5 20h14" />
    </svg>
  );
}

const STEPS = [
  {
    n: "1",
    title: "Sube un documento",
    body: "Acepta PDF (hasta 25 MB) e imágenes PNG, JPEG y HEIC/HEIF. El archivo se guarda en PostgreSQL y queda listo para analizar.",
  },
  {
    n: "2",
    title: "Extracción automática",
    body: "El motor de visión qwen3-vl:8b (Ollama, 100 % local) analiza cada página y extrae datos clave: emisor, receptor, RFC, fecha, folio, moneda, subtotal, impuestos, total y conceptos.",
  },
  {
    n: "3",
    title: "Validación manual",
    body: "Revisa los campos extraídos y corrígelos antes de guardar. Si el escaneo falla, puedes llenar los datos a mano con el formato clave: valor.",
  },
  {
    n: "4",
    title: "Indexación vectorial",
    body: "El contenido se convierte en embebidos con pgvector (dimensión 64) junto con los metadatos en JSON. Así los documentos quedan buscables por significado.",
  },
  {
    n: "5",
    title: "Chat inteligente",
    body: "El chat decide automáticamente entre búsqueda semántica (pgvector) y consultas SQL estructuradas, y responde citando los documentos fuente.",
  },
];

const TECH = [
  "Next.js 14 (App Router)",
  "React 18",
  "TypeScript",
  "PostgreSQL + pgvector",
  "Ollama + qwen3-vl:8b",
  "PDF.js (pdfjs-dist)",
  "Bootstrap 5.3",
  "Node.js API Routes",
  "Web Audio API",
];

export default function AboutProject() {
  return (
    <div className="about-project">
      <div>
        <h2>Cómo funciona</h2>
        <p className="about-lead">
          RAG Studio es un asistente de documentos basado en RAG: lee tus
          facturas, recibos, nóminas y contratos, extrae sus datos y responde
          preguntas sobre ellos con citas a la fuente.
        </p>
      </div>

      <div className="about-grid">
        {STEPS.map((s) => (
          <div key={s.n} className="about-step">
            <span className="about-step-num">{s.n}</span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </div>
        ))}
      </div>

      <div>
        <h2>Tecnologías utilizadas</h2>
        <div className="about-tech">
          {TECH.map((t) => (
            <span key={t} className="tech-chip">
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="about-demo">
        <DownloadIcon />
        <div>
          <p>
            <strong>¿Quieres probarla?</strong> Descarga la factura de ejemplo
            y súbela a la pestaña <em>Listado</em> para ver la extracción,
            la validación y el chat en acción.
          </p>
          <a href="/Factura%20de%20Prueba%20RAG.pdf" download>
            Descargar Factura de Prueba RAG.pdf
          </a>
        </div>
      </div>
    </div>
  );
}