CREATE TABLE outlets (
    __mongo_id CHARACTER(24) DEFAULT NULL,
    __mongo_owner_id CHARACTER(24) DEFAULT NULL,
    __mongo_user_ids CHARACTER(24)[] DEFAULT NULL,
    __mongo_purchases JSON DEFAULT NULL,
    __mongo_stripe_card_id TEXT DEFAULT NULL,
    __mongo_stripe_card_brand CHARACTER VARYING(24) DEFAULT NULL,
    __mongo_stripe_card_last4 CHARACTER(4) DEFAULT NULL,
    
    id BIGSERIAL PRIMARY KEY,
    title CHARACTER VARYING(32) NOT NULL,
    owner_id BIGINT DEFAULT NULL,
    bio TEXT NOT NULL DEFAULT '',
    link CHARACTER VARYING(255) DEFAULT NULL,
    avatar CHARACTER VARYING(255) DEFAULT NULL,
    goal INTEGER DEFAULT 0 NOT NULL,
    stripe_customer_id TEXT DEFAULT NULL,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    dispatch_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    _fts TSVECTOR DEFAULT NULL
);