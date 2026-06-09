ALTER TABLE recommendations ADD COLUMN domain_id TEXT NOT NULL DEFAULT 'global';

CREATE INDEX IF NOT EXISTS idx_recommendations_domain_score
  ON recommendations(domain_id, score DESC, id DESC);
