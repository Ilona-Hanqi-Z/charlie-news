CREATE TABLE following_users (
    id BIGSERIAL,
    user_id BIGINT NOT NULL,
    other_id BIGINT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    action_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, other_id)
);

-- TODO
-- Change created_at to updated_at and add is_following so that subsequently unfollowing
-- and refollowing the user does not notify them again