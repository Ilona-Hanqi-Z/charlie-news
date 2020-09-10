DROP TRIGGER IF EXISTS story_tsvector_insert ON stories;
CREATE TRIGGER story_tsvector_insert
    AFTER INSERT ON stories
    FOR EACH ROW
    EXECUTE PROCEDURE story_set_tsvector();
DROP TRIGGER IF EXISTS story_tsvector_update ON stories;
CREATE TRIGGER story_tsvector_update
    AFTER UPDATE ON stories
    FOR EACH ROW
    WHEN (OLD.title != NEW.title OR OLD.caption != NEW.caption OR OLD.tags != NEW.tags)
    EXECUTE PROCEDURE story_set_tsvector();