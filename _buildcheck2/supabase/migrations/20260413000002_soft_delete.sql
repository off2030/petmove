-- Add soft delete column to cases
ALTER TABLE cases ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Index for fast filtering of non-deleted cases
CREATE INDEX IF NOT EXISTS idx_cases_deleted_at ON cases (deleted_at) WHERE deleted_at IS NULL;
