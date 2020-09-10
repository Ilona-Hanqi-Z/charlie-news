ALTER TABLE purchases
    ADD FOREIGN KEY (assignment_id) REFERENCES assignments(id)
        ON DELETE SET NULL,
    ADD FOREIGN KEY (outlet_id) REFERENCES outlets(id)
        ON DELETE SET NULL,
    ADD FOREIGN KEY (post_id) REFERENCES posts(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL;