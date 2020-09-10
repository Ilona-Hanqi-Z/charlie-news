CREATE TABLE story_reposts (
    id BIGSERIAL,
    story_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(story_id, user_id)
);