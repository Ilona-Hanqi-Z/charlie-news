CREATE TABLE api_versions (
    id BIGSERIAL PRIMARY KEY,
    version_major SMALLINT NOT NULL,
    version_minor SMALLINT NOT NULL,
    version_patch SMALLINT DEFAULT 0,
    is_lts BOOLEAN DEFAULT FALSE,
    is_enabled BOOLEAN DEFAULT TRUE,
    is_public BOOLEAN DEFAULT TRUE,

    deployed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deprecated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,

    CONSTRAINT unique_version UNIQUE(version_major, version_minor)
);