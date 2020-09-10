DROP TRIGGER IF EXISTS article_tsvector_insert ON articles;
CREATE TRIGGER article_tsvector_insert
    AFTER INSERT ON articles
    FOR EACH ROW
    EXECUTE PROCEDURE article_set_tsvector();
DROP TRIGGER IF EXISTS article_tsvector_update ON articles;
CREATE TRIGGER article_tsvector_update
    AFTER UPDATE ON articles
    FOR EACH ROW
    WHEN (OLD.title != NEW.title)
    EXECUTE PROCEDURE article_set_tsvector();