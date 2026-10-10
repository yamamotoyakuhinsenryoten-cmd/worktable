-- PostgreSQL / Neon: persist the log references attached to an assistant reply.
-- Existing messages remain NULL and continue to display without source links.
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS sources JSONB;
