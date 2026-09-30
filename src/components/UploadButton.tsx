"use client";

export default function UploadButton() {
  return (
    <button
      type="button"
      className="fab-upload"
      onClick={() => window.dispatchEvent(new CustomEvent("open-upload"))}
      title="Subir archivo"
      aria-label="Subir archivo"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 16V4" />
        <path d="m6 10 6-6 6 6" />
        <path d="M4 20h16" />
      </svg>
    </button>
  );
}