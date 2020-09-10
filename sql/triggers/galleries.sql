DROP TRIGGER IF EXISTS gallery_tsvector_insert ON galleries;
CREATE TRIGGER gallery_tsvector_insert
    AFTER INSERT ON galleries
    FOR EACH ROW
    EXECUTE PROCEDURE gallery_set_tsvector();
DROP TRIGGER IF EXISTS gallery_tsvector_update ON galleries;
CREATE TRIGGER gallery_tsvector_update
    AFTER UPDATE ON galleries
    FOR EACH ROW
    WHEN (OLD.caption != NEW.caption OR OLD.tags != NEW.tags)
    EXECUTE PROCEDURE gallery_set_tsvector();DROP TRIGGER IF EXISTS gallery_tsvector_insert ON galleries;

-- If a gallery was deleted and it had location data, propagate the changes
DROP TRIGGER IF EXISTS gallery_delete_propagate_location ON galleries;
CREATE TRIGGER gallery_delete_propagate_location
    BEFORE DELETE ON galleries
    FOR EACH ROW
    WHEN (ST_isEmpty(OLD.location::GEOMETRY) = FALSE)
    EXECUTE PROCEDURE gallery_delete_propagate_location();
