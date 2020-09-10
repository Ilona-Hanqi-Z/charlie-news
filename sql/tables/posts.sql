CREATE TABLE posts (
    __mongo_id CHARACTER(24) DEFAULT NULL,
    __mongo_parent_id CHARACTER(24) DEFAULT NULL,
    __mongo_owner_id CHARACTER(24) DEFAULT NULL,
    __mongo_curator_id CHARACTER(24) DEFAULT NULL,
    __mongo_external_account_id TEXT DEFAULT NULL,
    __mongo_external_account_username CHARACTER VARYING(64) DEFAULT NULL,
    __mongo_external_account_name CHARACTER VARYING(64) DEFAULT NULL,
    __mongo_external_id TEXT DEFAULT NULL,
    __mongo_external_url CHARACTER VARYING(255) DEFAULT NULL,
    __mongo_external_source CHARACTER VARYING(16) DEFAULT NULL,

    id BIGSERIAL PRIMARY KEY,
    parent_id BIGINT DEFAULT NULL,
    owner_id BIGINT DEFAULT NULL,
    curator_id BIGINT DEFAULT NULL,
    outlet_id BIGINT DEFAULT NULL, -- outlet this post was submitted to, used for first look
    assignment_id BIGINT DEFAULT NULL,
    exclusive_to BIGINT DEFAULT NULL,
    exclusive_until TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    job_id CHARACTER VARYING(128) DEFAULT NULL,
    raw TEXT DEFAULT NULL,
    image TEXT DEFAULT NULL,
    video TEXT DEFAULT NULL,
    stream TEXT DEFAULT NULL,
    duration INTEGER DEFAULT NULL,
    location GEOGRAPHY(Point) DEFAULT NULL,
    address TEXT DEFAULT NULL,
    width SMALLINT DEFAULT NULL,
    height SMALLINT DEFAULT NULL,
    license SMALLINT NOT NULL DEFAULT 0, -- 0 = Default Fresco License, 1 = Exclusive License; Default 0
    status SMALLINT NOT NULL DEFAULT 0, -- Default UPLOAD_PENDING
    rating SMALLINT NOT NULL DEFAULT 0,  -- Default UNRATED
    is_nsfw BOOLEAN DEFAULT FALSE,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);