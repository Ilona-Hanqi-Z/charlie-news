ALTER TABLE installations
    ADD FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL;