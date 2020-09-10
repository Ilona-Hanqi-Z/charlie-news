CREATE UNIQUE INDEX unique_location_per_outlet_idx ON outlet_locations(outlet_id, LOWER(title));
ALTER TABLE outlet_locations
    ADD FOREIGN KEY (outlet_id) REFERENCES outlets(id)
        ON DELETE CASCADE;