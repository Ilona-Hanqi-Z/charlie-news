CREATE INDEX IF NOT EXISTS purchase_stripe ON purchases (stripe_charge_id);
CREATE INDEX IF NOT EXISTS purchases_post_id_idx ON purchases (post_id);
CREATE INDEX IF NOT EXISTS purchases_outlet_id_idx ON purchases (outlet_id);

CREATE INDEX IF NOT EXISTS purchase_timestamp_idx ON purchases (created_at);