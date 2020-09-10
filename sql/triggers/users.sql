DROP TRIGGER IF EXISTS user_tsvector_insert ON users;
CREATE TRIGGER user_tsvector_insert
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE PROCEDURE user_set_tsvector();
DROP TRIGGER IF EXISTS user_tsvector_update ON users;
CREATE TRIGGER user_tsvector_update
    AFTER UPDATE ON users
    FOR EACH ROW
    WHEN (
        OLD.full_name != NEW.full_name OR
        OLD.email != NEW.email OR
        OLD.username != NEW.username OR
        OLD.location != NEW.location OR
        OLD.bio != NEW.bio
    )
    EXECUTE PROCEDURE user_set_tsvector();