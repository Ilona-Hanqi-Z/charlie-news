ALTER TABLE assignment_users
    ADD FOREIGN KEY (assignment_id) REFERENCES assignments(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE;