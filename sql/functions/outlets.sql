CREATE OR REPLACE FUNCTION outlet_set_tsvector() RETURNS TRIGGER AS $$
    BEGIN
        UPDATE outlets AS o
            SET _fts =  SETWEIGHT(TO_TSVECTOR('english', NEW.title || ' ' || COALESCE(NEW.link, '')), 'A') ||
                        SETWEIGHT(TO_TSVECTOR('english', COALESCE(NEW.bio, '')), 'B')
            WHERE o.id = NEW.id;
        RETURN NEW;
    END
$$ LANGUAGE plpgsql;