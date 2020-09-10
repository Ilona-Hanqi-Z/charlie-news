CREATE TABLE story_comments (
    story_id BIGINT NOT NULL,
    comment_id BIGINT NOT NULL,
    PRIMARY KEY(story_id, comment_id)
);