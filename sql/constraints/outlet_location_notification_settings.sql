ALTER TABLE outlet_location_notification_settings
    ADD FOREIGN KEY (location_id) REFERENCES outlet_locations(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE;