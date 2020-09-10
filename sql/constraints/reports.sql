ALTER TABLE reports
    ADD FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE;