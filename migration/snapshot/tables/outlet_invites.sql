CREATE TABLE outlet_invites (
    outlet_id BIGINT NOT NULL,
    user_id bigint DEFAULT NULL,
    email CHARACTER VARYING(254),
    scopes CHARACTER VARYING(64)[] NOT NULL DEFAULT '{"outlet::"}',
    token character varying(128) PRIMARY KEY,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP + INTERVAL '1 week',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);