declare module "pdfjs-dist/legacy/build/pdf.js" {
  export interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNum: number): Promise<PDFPageProxy>;
  }

  export interface PDFPageProxy {
    getViewport(params: { scale: number }): PDFViewport;
    render(params: {
      canvasContext: unknown;
      viewport: PDFViewport;
    }): { promise: Promise<void> };
    getTextContent(): Promise<{
      items: Array<{ str?: string }>;
    }>;
  }

  export interface PDFViewport {
    width: number;
    height: number;
  }

  export function getDocument(src: unknown): {
    promise: Promise<PDFDocumentProxy>;
  };

  export const GlobalWorkerOptions: { workerSrc: string };
  export const version: string;
}