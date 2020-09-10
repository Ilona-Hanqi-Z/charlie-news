ALTER TABLE gallery_posts
    ADD FOREIGN KEY (gallery_id) REFERENCES galleries(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (post_id) REFERENCES posts(id)
        ON DELETE CASCADE;