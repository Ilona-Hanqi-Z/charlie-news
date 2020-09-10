ALTER TABLE installation_subscriptions
    ADD FOREIGN KEY (installation_id) REFERENCES installations(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (user_setting_id) REFERENCES user_settings(id)
        ON DELETE CASCADE;