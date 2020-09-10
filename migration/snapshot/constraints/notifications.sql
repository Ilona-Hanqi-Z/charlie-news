ALTER TABLE notifications
    ADD FOREIGN KEY (type_id) REFERENCES notification_types(id)
        ON DELETE CASCADE;