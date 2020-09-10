CREATE INDEX IF NOT EXISTS story_update_timestamp_idx ON stories (updated_at);
CREATE INDEX IF NOT EXISTS story_geo ON stories USING GIST (location);
CREATE INDEX IF NOT EXISTS story_fts ON stories USING GIN(_fts);