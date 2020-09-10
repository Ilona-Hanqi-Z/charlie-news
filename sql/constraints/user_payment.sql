ALTER TABLE user_payment
    ADD FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE;