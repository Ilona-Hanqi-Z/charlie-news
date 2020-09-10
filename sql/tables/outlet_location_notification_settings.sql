CREATE TABLE outlet_location_notification_settings (
    user_id BIGINT NOT NULL,
    location_id BIGINT NOT NULL,
    send_email BOOLEAN NOT NULL,
    send_fresco BOOLEAN NOT NULL,
    send_push BOOLEAN NOT NULL,
    send_sms BOOLEAN NOT NULL,
    
    PRIMARY KEY(user_id, location_id)
);