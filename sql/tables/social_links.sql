CREATE TABLE social_links (
    user_id BIGINT NOT NULL,
    account_id TEXT NOT NULL,
    platform CHARACTER VARYING(16) NOT NULL,
    
    CONSTRAINT one_per_platform_per_user UNIQUE (user_id, platform),
    CONSTRAINT one_per_platform_per_account_id UNIQUE (platform, account_id)
);