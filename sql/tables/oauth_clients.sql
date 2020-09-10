CREATE TABLE oauth_clients (
    id BIGSERIAL PRIMARY KEY,
    family_id BIGINT DEFAULT NULL,
    client_id CHARACTER VARYING(60) NOT NULL,
    client_secret CHARACTER VARYING(190) NOT NULL,
    api_version_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    outlet_id BIGINT DEFAULT NULL,
    tag TEXT DEFAULT NULL,
    redirect_uri TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_At TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT oauth_clients_unique_client_id UNIQUE (client_id)
);