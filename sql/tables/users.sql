CREATE TABLE users (
    __parse_id CHARACTER VARYING(24) DEFAULT NULL,
    __parse_twitter_id TEXT DEFAULT NULL,
    __parse_facebook_id TEXT DEFAULT NULL,
    __mongo_id CHARACTER(24) DEFAULT NULL,
    __mongo_rank SMALLINT DEFAULT NULL,
    __mongo_loc GEOMETRY DEFAULT NULL,
    __mongo_loc_time TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    
    id BIGSERIAL PRIMARY KEY,
    outlet_id BIGINT DEFAULT NULL,
    email CHARACTER VARYING(254) DEFAULT NULL, -- NOT NULL, MIGRATE-TODO: Change to not null after migration
    password CHARACTER VARYING(60) DEFAULT NULL, -- NOT NULL,
    username CHARACTER VARYING(32) DEFAULT NULL, -- NOT NULL,
    full_name CHARACTER VARYING(40),
    bio TEXT DEFAULT '',
    location CHARACTER VARYING(40) DEFAULT NULL,
    radius INTEGER DEFAULT 0,
    phone CHARACTER VARYING(15),
    avatar CHARACTER VARYING(255),
    twitter_handle CHARACTER VARYING(20),
    terms SMALLINT NOT NULL DEFAULT (-1),
    verification_token CHARACTER(64),
    reset_token CHARACTER(64) DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    suspended_until TIMESTAMP WITH TIME ZONE DEFAULT NULL,

    offense_count INTEGER DEFAULT 0 NOT NULL,

    -- Stripe info
    stripe_account_id TEXT DEFAULT NULL,
    stripe_secret_key TEXT DEFAULT NULL,
    stripe_public_key TEXT DEFAULT NULL,

    -- Monetary abilities
    charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    transfers_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    knows_cant_transfer BOOLEAN DEFAULT NULL, -- Flag for if the user was alerted of any issues regarding payment processing, and thus won't be notified again'
    
    -- fulltext search
    _fts TSVECTOR DEFAULT NULL
);