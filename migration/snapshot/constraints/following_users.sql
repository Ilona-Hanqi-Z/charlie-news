ALTER TABLE following_users
    ADD FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (other_id) REFERENCES users(id)
        ON DELETE CASCADE;