ALTER TABLE posts
    ADD FOREIGN KEY (owner_id) REFERENCES users(id)
        ON DELETE SET NULL,
    ADD FOREIGN KEY (curator_id) REFERENCES users(id)
        ON DELETE SET NULL,
    ADD FOREIGN KEY (parent_id) REFERENCES galleries(id)
        ON DELETE SET NULL,
    ADD FOREIGN KEY (exclusive_to) REFERENCES outlets(id)
        ON DELETE SET NULL,
    ADD FOREIGN KEY (assignment_id) REFERENCES assignments(id)
        ON DELETE SET NULL,
    ADD FOREIGN KEY (outlet_id) REFERENCES outlets(id)
        ON DELETE SET NULL;