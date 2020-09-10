ALTER TABLE assignment_outlets DROP CONSTRAINT assignment_outlets_assignment_id_outlet_id_key;
ALTER TABLE assignment_outlets ADD PRIMARY KEY(assignment_id, outlet_id);
CREATE INDEX IF NOT EXISTS assignment_outlets_created_at_idx ON assignment_outlets (created_at);

-- When creating setting type, generate all user_settings with default values
CREATE OR REPLACE FUNCTION propagate_new_setting_defaults() RETURNS TRIGGER AS $$
    BEGIN
        INSERT INTO user_settings (user_id, type, options) (SELECT id AS user_id, NEW.type AS type, NEW.options_default AS options FROM users);
        RETURN NEW;
    END
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS new_setting_type ON setting_types;
CREATE TRIGGER new_setting_type
    AFTER INSERT ON setting_types
    FOR EACH ROW
    EXECUTE PROCEDURE propagate_new_setting_defaults();

-- Automatically delete user_settings when the corresponding setting type is deleted
ALTER TABLE user_settings
    DROP CONSTRAINT user_settings_type_fkey,
    ADD CONSTRAINT user_settings_type_fkey
        FOREIGN KEY (type)
        REFERENCES setting_types(type)
        ON DELETE CASCADE;

-- Create new setting type
INSERT INTO setting_types (type, title, description, options_default) VALUES
    (
        'notify-outlet-inactive',
        'Inactivity Alerts',
        'Notify me when my outlet has not created an assignment within the last 24 hours',
        '{ "send_email": true }'::JSONB
    ),
    (
        'notify-outlet-recommended-content',
        'Recommended Content',
        'Notify me when Fresco finds content I may be interested in',
        '{ "send_email": true }'::JSONB
    );