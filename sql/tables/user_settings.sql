CREATE TABLE user_settings (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    type CHARACTER VARYING(40) NOT NULL REFERENCES setting_types (type) ON DELETE CASCADE,
    options JSONB NOT NULL DEFAULT '{}'::JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_setting UNIQUE(user_id, type)
);