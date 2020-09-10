ALTER TABLE assignments
    ADD FOREIGN KEY (creator_id) REFERENCES users(id)
        ON DELETE SET NULL,
    ADD FOREIGN KEY (curator_id) REFERENCES users(id)
        ON DELETE SET NULL;