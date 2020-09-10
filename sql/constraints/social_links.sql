ALTER TABLE social_links
    ADD FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE;