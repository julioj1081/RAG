export const MAX_UPLOAD_SIZE = 25 * 1024 * 1024;

const ALLOWED_MIME = /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml|heic|heif)$|^application\/pdf$/;
const ALLOWED_EXT = /\.(png|jpe?g|webp|gif|bmp|svg|heic|heif|pdf)$/i;

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME.test(mime);
}

export function isAllowedFile(name: string, mime: string): boolean {
  return ALLOWED_MIME.test(mime) || ALLOWED_EXT.test(name);
}

export function mimeFromName(name: string): string | null {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "svg":
      return "image/svg+xml";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    case "pdf":
      return "application/pdf";
    default:
      return null;
  }
}

function ascii(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function startsWithBytes(bytes: Uint8Array, header: number[]): boolean {
  if (bytes.length < header.length) return false;
  for (let i = 0; i < header.length; i++) {
    if (bytes[i] !== header[i]) return false;
  }
  return true;
}

const PDF_HEADER: number[] = [0x25, 0x50, 0x44, 0x46, 0x2d];

export function validateContent(mime: string, bytes: Uint8Array): boolean {
  if (!bytes || bytes.length === 0) return false;
  const normalized = mime.toLowerCase();

  switch (normalized) {
    case "application/pdf": {
      if (!startsWithBytes(bytes, PDF_HEADER)) return false;
      const tail = bytes.slice(Math.max(0, bytes.length - 1024));
      return ascii(tail).includes("%%EOF");
    }
    case "image/png":
      return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
    case "image/jpg":
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/gif":
      return startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38]);
    case "image/webp":
      return (
        bytes.length >= 12 &&
        ascii(bytes.slice(0, 4)) === "RIFF" &&
        ascii(bytes.slice(8, 12)) === "WEBP"
      );
    case "image/bmp":
      return ascii(bytes.slice(0, 2)) === "BM";
    case "image/svg+xml": {
      const head = ascii(bytes.slice(0, Math.min(1024, bytes.length))).toLowerCase();
      return head.includes("<svg") || head.startsWith("<?xml");
    }
    case "image/heic":
    case "image/heif": {
      const head = ascii(bytes.slice(4, 12));
      return head === "ftypheic" || head === "ftypheix" || head === "ftypheif" || head === "ftyphevc" || head === "ftypheim" || head === "ftypheis" || head === "ftypmif1" || head === "ftypmsf1";
    }
    default:
      return true;
  }
}