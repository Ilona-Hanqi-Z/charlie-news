ALTER TABLE story_comments
    ADD FOREIGN KEY (story_id) REFERENCES stories(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (comment_id) REFERENCES comments(id)
        ON DELETE CASCADE;