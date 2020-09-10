CREATE TABLE installations (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT DEFAULT NULL,
    app_version CHARACTER VARYING(10) NOT NULL,
    platform CHARACTER VARYING(10) NOT NULL,
    device_token TEXT DEFAULT NULL,
    timezone    CHARACTER VARYING(40) DEFAULT NULL,
    locale_identifier CHARACTER VARYING(24) DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,

    sns_endpoint_arn TEXT NOT NULL,

    CONSTRAINT installation_unique_device_token UNIQUE(device_token)
);

-- TODO
-- INDEX device_token
-- INDEX user_id?