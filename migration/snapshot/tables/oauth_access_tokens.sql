CREATE TABLE oauth_access_tokens (
    id BIGSERIAL PRIMARY KEY,
    role_id BIGINT NOT NULL,
    client_id BIGINT NOT NULL,
    user_id BIGINT DEFAULT NULL,
    token TEXT NOT NULL,
    refresh_token TEXT DEFAULT NULL,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP + INTERVAL '1 month',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT oauth_access_tokens_unique_refresh UNIQUE (token),
    CONSTRAINT oauth_access_tokens_unique_token UNIQUE (refresh_token)
);