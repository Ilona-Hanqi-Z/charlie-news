ALTER TABLE gallery_reports
    ADD FOREIGN KEY (gallery_id) REFERENCES galleries(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (report_id) REFERENCES reports(id)
        ON DELETE CASCADE;