CREATE INDEX IF NOT EXISTS gallery_update_timestamp_idx ON galleries (updated_at);
CREATE INDEX IF NOT EXISTS gallery_geo ON galleries USING GIST (location);
CREATE INDEX IF NOT EXISTS gallery_fts ON galleries USING GIN(_fts);