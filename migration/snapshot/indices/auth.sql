CREATE INDEX IF NOT EXISTS user_roles_user_idx ON user_roles (user_id);
CREATE INDEX IF NOT EXISTS oauth_access_tokens_client_idx ON oauth_access_tokens (client_id);