ALTER TABLE stories
    ADD FOREIGN KEY (curator_id) REFERENCES users(id)
        ON DELETE SET NULL;