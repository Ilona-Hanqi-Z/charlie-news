ALTER TABLE story_galleries
    ADD FOREIGN KEY (story_id) REFERENCES stories(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (gallery_id) REFERENCES galleries(id)
        ON DELETE CASCADE;