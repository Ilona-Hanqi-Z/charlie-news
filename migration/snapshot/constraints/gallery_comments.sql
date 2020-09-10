ALTER TABLE gallery_comments
    ADD FOREIGN KEY (gallery_id) REFERENCES galleries(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (comment_id) REFERENCES comments(id)
        ON DELETE CASCADE;