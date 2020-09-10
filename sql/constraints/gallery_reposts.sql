ALTER TABLE gallery_reposts
    ADD FOREIGN KEY (gallery_id) REFERENCES galleries(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE;