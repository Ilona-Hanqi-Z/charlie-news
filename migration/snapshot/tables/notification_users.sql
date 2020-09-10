CREATE TABLE notification_users (
    user_id BIGINT NOT NULL,
    notification_id BIGINT NOT NULL,
    seen_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);