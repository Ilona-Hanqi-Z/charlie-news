ALTER TABLE user_reports
    ADD FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (report_id) REFERENCES reports(id)
        ON DELETE CASCADE;