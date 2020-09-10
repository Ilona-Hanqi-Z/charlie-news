DROP TRIGGER IF EXISTS installation_user_changed ON installations;
CREATE TRIGGER installation_user_changed
    BEFORE UPDATE ON installations
    FOR EACH ROW
    WHEN (
        OLD.user_id IS NOT NULL
        AND OLD.user_id != NEW.user_id
    )
    EXECUTE PROCEDURE clear_installation_subscriptions();