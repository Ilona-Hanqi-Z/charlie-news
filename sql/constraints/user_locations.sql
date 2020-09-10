ALTER TABLE user_locations
    ADD FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE;