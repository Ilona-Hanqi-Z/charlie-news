-- Recap's related stories
CREATE TABLE recap_stories (
    recap_id BIGINT NOT NULL,
    story_id BIGINT NOT NULL,
    PRIMARY KEY(recap_id, story_id)
);