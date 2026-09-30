CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size_bytes  BIGINT NOT NULL,
  content     BYTEA NOT NULL,
  embedding   vector(64),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);