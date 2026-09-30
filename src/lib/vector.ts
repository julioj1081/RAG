import { createHash } from "crypto";

export const VECTOR_DIM = 64;

export function vectorToSql(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

function hashEmbed(data: Buffer, dim: number): number[] {
  const hash = createHash("sha256").update(data).digest();
  const vec: number[] = [];
  for (let i = 0; i < dim; i++) {
    const b1 = hash[i % hash.length] ?? 0;
    const b2 = hash[(i * 7 + 3) % hash.length] ?? 0;
    const byte = (b1 ^ b2) & 0xff;
    vec.push(Number(((byte / 255) * 2 - 1).toFixed(6)));
  }
  return vec;
}

export function computeVector(data: Buffer, dim = VECTOR_DIM): number[] {
  return hashEmbed(data, dim);
}

export function computeTextVector(text: string, dim = VECTOR_DIM): number[] {
  return hashEmbed(Buffer.from(text, "utf8"), dim);
}