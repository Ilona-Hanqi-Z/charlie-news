CREATE TABLE user_reports (
    user_id BIGINT NOT NULL,
    report_id BIGINT NOT NULL,
    PRIMARY KEY(user_id, report_id)
);