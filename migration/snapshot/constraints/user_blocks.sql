ALTER TABLE user_blocks
    ADD FOREIGN KEY (blocking_user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (blocked_user_id) REFERENCES users(id)
        ON DELETE CASCADE;