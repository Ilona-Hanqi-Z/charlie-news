CREATE OR REPLACE FUNCTION article_set_tsvector() RETURNS TRIGGER AS $$
    BEGIN
        UPDATE articles AS a
            SET _fts =  SETWEIGHT(TO_TSVECTOR('english', NEW.title), 'A')
            WHERE a.id = NEW.id;
        RETURN NEW;
    END
$$ LANGUAGE plpgsql;