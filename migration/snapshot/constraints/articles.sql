ALTER TABLE articles
    ADD FOREIGN KEY (outlet_id) REFERENCES outlets(id)
        ON DELETE SET NULL;