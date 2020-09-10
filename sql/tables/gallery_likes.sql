CREATE TABLE gallery_likes (
    id BIGSERIAL,
    gallery_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    action_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(gallery_id, user_id)
);