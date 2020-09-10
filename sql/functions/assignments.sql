CREATE OR REPLACE FUNCTION assignment_set_tsvector() RETURNS TRIGGER AS $$
    BEGIN
        UPDATE assignments AS a
            SET _fts =  SETWEIGHT(TO_TSVECTOR('english', NEW.title), 'A') ||
                        SETWEIGHT(TO_TSVECTOR('english', NEW.caption), 'B')
            WHERE a.id = NEW.id;
        RETURN NEW;
    END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION buffer_assignment_location() RETURNS TRIGGER AS $$
    BEGIN
        UPDATE assignments
        SET location_buffered = (
            CASE WHEN NEW.location IS NULL
            THEN NULL
            ELSE (
                CASE WHEN NEW.radius IS NULL OR NEW.radius = 0
                THEN NEW.location
                ELSE ST_Buffer(NEW.location, NEW.radius)
                END
            )
            END
        )
        WHERE id = NEW.id;
        RETURN NEW;
    END
$$ LANGUAGE plpgsql;