CREATE INDEX IF NOT EXISTS post_rating_idx ON posts (rating);
CREATE INDEX IF NOT EXISTS post_status_idx ON posts (status);
CREATE INDEX IF NOT EXISTS post_owner_idx ON posts (owner_id);
CREATE INDEX IF NOT EXISTS post_assignment_idx ON posts (assignment_id);
CREATE INDEX IF NOT EXISTS post_outlet_idx ON posts (outlet_id);

CREATE INDEX IF NOT EXISTS post_geo ON posts USING GIST (location);
CREATE INDEX IF NOT EXISTS post_timestamp_idx ON posts (created_at);