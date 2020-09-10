ALTER TABLE user_settings
    ADD FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE;