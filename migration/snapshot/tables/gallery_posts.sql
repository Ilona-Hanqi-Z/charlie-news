-- Gallery's contained posts
CREATE TABLE gallery_posts (
    gallery_id BIGINT NOT NULL,
    post_id BIGINT NOT NULL,
    position INTEGER,
    PRIMARY KEY(gallery_id, post_id)
);