ALTER TABLE comment_entities
    ADD FOREIGN KEY (comment_id) REFERENCES comments(id)
        ON DELETE CASCADE;