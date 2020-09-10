CREATE TABLE gallery_comments (
    gallery_id BIGINT NOT NULL,
    comment_id BIGINT NOT NULL,
    PRIMARY KEY(gallery_id, comment_id)
);