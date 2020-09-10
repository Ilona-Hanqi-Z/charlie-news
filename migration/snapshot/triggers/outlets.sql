DROP TRIGGER IF EXISTS outlet_tsvector_insert ON outlet;
CREATE TRIGGER outlet_tsvector_insert
    AFTER INSERT ON outlets
    FOR EACH ROW
    EXECUTE PROCEDURE outlet_set_tsvector();
DROP TRIGGER IF EXISTS outlet_tsvector_update ON outlet;
CREATE TRIGGER outlet_tsvector_update
    AFTER UPDATE ON outlets
    FOR EACH ROW
    WHEN (
        NEW.title != OLD.title OR
        NEW.link != OLD.link OR
        NEW.bio != OLD.bio
    )
    EXECUTE PROCEDURE outlet_set_tsvector();