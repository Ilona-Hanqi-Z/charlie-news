CREATE INDEX IF NOT EXISTS outlet_payment_stripe ON outlet_payment (stripe_source_id);
CREATE INDEX IF NOT EXISTS outlet_stripe ON outlets (stripe_customer_id);

CREATE INDEX IF NOT EXISTS outlet_fts ON outlets USING GIN(_fts);

CREATE INDEX IF NOT EXISTS outlet_location_geo ON outlet_locations USING GIST (location);
CREATE INDEX IF NOT EXISTS article_fts ON outlets USING GIN(_fts);