CREATE INDEX IF NOT EXISTS notification_users_notification_id_idx ON notification_users (notification_id);
CREATE INDEX IF NOT EXISTS notification_users_user_id_idx ON notification_users (user_id);
CREATE INDEX IF NOT EXISTS notification_users_seen_time_idx ON notification_users (seen_at);
CREATE INDEX IF NOT EXISTS notification_users_time_idx ON notification_users (created_at);
CREATE INDEX IF NOT EXISTS notification_time_idx ON notifications (created_at);