CREATE INDEX IF NOT EXISTS assignment_geo ON assignments USING GIST (location);
CREATE INDEX IF NOT EXISTS assignment_location_buffered_geo ON assignments USING GIST (location_buffered);

CREATE INDEX IF NOT EXISTS assignment_fts ON assignments USING GIN(_fts);