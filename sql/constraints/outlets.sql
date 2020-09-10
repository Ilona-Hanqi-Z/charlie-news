ALTER TABLE outlets
    ADD FOREIGN KEY (owner_id) REFERENCES users(id)
        ON DELETE SET NULL;

CREATE UNIQUE INDEX unique_outlet_title ON outlets(LOWER(title));