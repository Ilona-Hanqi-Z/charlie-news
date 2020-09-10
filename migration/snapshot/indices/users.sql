CREATE INDEX IF NOT EXISTS user_payment_stripe ON user_payment (stripe_id);
CREATE INDEX IF NOT EXISTS user_stripe ON users (stripe_account_id);

CREATE INDEX IF NOT EXISTS user_current_geo ON user_locations USING GIST (curr_geo);
CREATE INDEX IF NOT EXISTS user_fts ON users USING GIN(_fts);

CREATE INDEX IF NOT EXISTS settings_jsonb ON user_settings USING GIN(options);
