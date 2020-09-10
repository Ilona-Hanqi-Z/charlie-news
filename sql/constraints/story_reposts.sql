ALTER TABLE story_reposts
    ADD FOREIGN KEY (story_id) REFERENCES stories(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE;