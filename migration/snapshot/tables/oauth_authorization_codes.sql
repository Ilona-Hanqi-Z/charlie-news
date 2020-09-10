CREATE TABLE oauth_authorization_codes (
	id BIGSERIAL PRIMARY KEY,
	token TEXT NOT NULL,
	user_id BIGINT NOT NULL,
	role_id BIGINT NOT NULL,
	client_id BIGINT NOT NULL,
	redirect_uri TEXT NOT NULL,
	state TEXT DEFAULT NULL,

	CONSTRAINT oauth_authorization_codes_unique_token UNIQUE(token)
);