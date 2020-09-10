ALTER TABLE galleries
    ADD FOREIGN KEY (owner_id) REFERENCES users(id)
        ON DELETE SET NULL,
    ADD FOREIGN KEY (curator_id) REFERENCES users(id)
        ON DELETE SET NULL,
    ADD FOREIGN KEY (importer_id) REFERENCES users(id)
        ON DELETE SET NULL;