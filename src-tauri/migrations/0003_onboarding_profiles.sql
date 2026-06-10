CREATE TABLE IF NOT EXISTS onboarding_profiles (
  domain_id      TEXT PRIMARY KEY,
  goal           TEXT NOT NULL DEFAULT '',
  interests_json TEXT NOT NULL DEFAULT '[]',
  background     TEXT,
  updated_at     TEXT NOT NULL
);
