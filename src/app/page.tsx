import CardTabs from "@/components/CardTabs";
import ThemeToggle from "@/components/ThemeToggle";
import UploadButton from "@/components/UploadButton";

export default function Home() {
  return (
    <main>
      <ThemeToggle />
      <UploadButton />
      <header>
        <h1>RAG Studio</h1>
        <p>Sube imágenes o PDFs para almacenarlos en PostgreSQL (pgvector) y previsualizarlos.</p>
      </header>

      <section className="card">
        <CardTabs />
      </section>

      <p className="footer-note">
        Verificación automática con <code>qwen3-vl:8b</code> (Ollama local) · almacenado en <code>documents</code> con <code>vector(64)</code> de pgvector.
      </p>
    </main>
  );
}