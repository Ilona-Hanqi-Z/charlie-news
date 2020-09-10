ALTER TABLE notification_users
    ADD FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (notification_id) REFERENCES notifications(id)
        ON DELETE CASCADE;