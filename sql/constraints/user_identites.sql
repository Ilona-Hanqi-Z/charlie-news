ALTER TABLE user_identities
    ADD FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE;