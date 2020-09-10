-- Update the related story locations when a gallery is deleted
CREATE OR REPLACE FUNCTION gallery_delete_propagate_location() RETURNS TRIGGER AS $$
    BEGIN
        UPDATE stories AS s
            SET location = (SELECT ST_Multi(ST_CollectionExtract(ST_Difference(s.location::GEOMETRY, OLD.location::GEOMETRY), 1)))
            FROM story_galleries AS sg
            WHERE sg.gallery_id = OLD.id
            AND s.id = sg.story_id;
        RETURN OLD;
    END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION gallery_set_tsvector() RETURNS TRIGGER AS $$
    BEGIN
        UPDATE galleries AS g
            SET _fts =  SETWEIGHT(TO_TSVECTOR('english', NEW.caption), 'A') ||
                        SETWEIGHT(TO_TSVECTOR('english', ARRAY_TO_STRING(NEW.tags, ' ')), 'C')
            WHERE g.id = NEW.id;
        RETURN NEW;
    END
$$ LANGUAGE plpgsql;