ALTER TABLE recap_stories
    ADD FOREIGN KEY (recap_id) REFERENCES recaps(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (story_id) REFERENCES stories(id)
        ON DELETE CASCADE;