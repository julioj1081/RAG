import { pool } from "./db";

let schemaReady: Promise<void> | null = null;

const MIGRATIONS = [
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type TEXT`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_score REAL`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_json JSONB`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS raw_text TEXT`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS analysis_provider TEXT`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS analysis_model TEXT`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS validated BOOLEAN NOT NULL DEFAULT FALSE`,
];

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const sql of MIGRATIONS) {
          await client.query(sql);
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    })();
  }
  return schemaReady;
}