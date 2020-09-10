CREATE TABLE gallery_reports (
    gallery_id BIGINT NOT NULL,
    report_id BIGINT NOT NULL,
    PRIMARY KEY(gallery_id, report_id)
);