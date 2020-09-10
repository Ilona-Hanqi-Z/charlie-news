CREATE TABLE installation_subscriptions (
    installation_id BIGINT NOT NULL,
    user_setting_id BIGINT NOT NULL,
    subscription_arn TEXT,

    PRIMARY KEY(installation_id, user_setting_id)
);