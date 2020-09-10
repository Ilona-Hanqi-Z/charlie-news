-- If any post location was changed, propagate the changes
DROP TRIGGER IF EXISTS post_update_propagate_location ON posts;
CREATE TRIGGER post_update_propagate_location
    BEFORE UPDATE ON posts
    FOR EACH ROW
    WHEN (OLD.location IS DISTINCT FROM NEW.location)
    EXECUTE PROCEDURE modify_post_propagate_location();

-- If any post was deleted, and it has location data, propagate the changes
DROP TRIGGER IF EXISTS post_delete_propagate_location ON posts;
CREATE TRIGGER post_delete_propagate_location
    BEFORE DELETE ON posts
    FOR EACH ROW
    WHEN (OLD.location IS NOT NULL)
    EXECUTE PROCEDURE post_delete_propagate_location();