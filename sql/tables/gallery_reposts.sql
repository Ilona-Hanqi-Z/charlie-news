CREATE TABLE gallery_reposts (
    id BIGSERIAL,
    gallery_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(gallery_id, user_id)
);