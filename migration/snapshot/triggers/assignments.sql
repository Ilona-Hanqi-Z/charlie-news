DROP TRIGGER IF EXISTS assignment_tsvector_insert ON assignments;
CREATE TRIGGER assignment_tsvector_insert
    AFTER INSERT ON assignments
    FOR EACH ROW
    EXECUTE PROCEDURE assignment_set_tsvector();
DROP TRIGGER IF EXISTS assignment_tsvector_update ON assignments;
CREATE TRIGGER assignment_tsvector_update
    AFTER UPDATE ON assignments
    FOR EACH ROW
    WHEN (OLD.title != NEW.title OR OLD.caption != NEW.caption)
    EXECUTE PROCEDURE assignment_set_tsvector();

DROP TRIGGER IF EXISTS buffer_assignment_location_on_insert ON assignments;
CREATE TRIGGER buffer_assignment_location_on_insert
    AFTER INSERT ON assignments
    FOR EACH ROW
    EXECUTE PROCEDURE buffer_assignment_location();
DROP TRIGGER IF EXISTS buffer_assignment_location_on_update ON assignments;
CREATE TRIGGER buffer_assignment_location_on_update
    AFTER UPDATE ON assignments
    FOR EACH ROW
    WHEN (
        NEW.radius != OLD.radius
        OR NEW.location != OLD.location
    )
    EXECUTE PROCEDURE buffer_assignment_location();