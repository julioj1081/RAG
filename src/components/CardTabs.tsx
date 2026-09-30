"use client";

import { useState } from "react";
import Uploader from "@/components/Uploader";
import AboutProject, { DownloadIcon } from "@/components/AboutProject";

type Tab = "docs" | "about";

export default function CardTabs() {
  const [tab, setTab] = useState<Tab>("docs");

  return (
    <div className="card-tabs">
      <div className="card-tabs-bar">
        <div
          className="card-tabs-nav"
          role="tablist"
          aria-label="Secciones de la tarjeta"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "docs"}
            className={`card-tab${tab === "docs" ? " active" : ""}`}
            onClick={() => setTab("docs")}
          >
            Listado
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "about"}
            className={`card-tab${tab === "about" ? " active" : ""}`}
            onClick={() => setTab("about")}
          >
            Cómo funciona
          </button>
        </div>

        <a
          className="card-download"
          href="/Factura%20de%20Prueba%20RAG.pdf"
          download="Factura de Prueba RAG.pdf"
        >
          <DownloadIcon />
          Factura de ejemplo
        </a>
      </div>

      {tab === "docs" ? <Uploader /> : <AboutProject />}
    </div>
  );
}