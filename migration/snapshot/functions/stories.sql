-- Update the related story location when a gallery with location data it added to the story
CREATE OR REPLACE FUNCTION story_galleries_insert_propagate_location() RETURNS TRIGGER AS $$
    BEGIN
        UPDATE stories AS s
            SET location = (SELECT ST_Multi(ST_CollectionExtract(ST_Union(s.location::GEOMETRY, g.location::GEOMETRY), 1)))
            FROM galleries AS g
            WHERE g.id = NEW.gallery_id
            AND ST_isEmpty(g.location::GEOMETRY) = FALSE
            AND s.id = NEW.story_id;
        RETURN NEW;
    END
$$ LANGUAGE plpgsql;

-- Update the related story location when a gallery with location data is removed from the story
CREATE OR REPLACE FUNCTION story_galleries_delete_propagate_location() RETURNS TRIGGER AS $$
    BEGIN
        UPDATE stories AS s
            SET location = (SELECT ST_Multi(ST_CollectionExtract(ST_Difference(s.location::GEOMETRY, g.location::GEOMETRY), 1)))
            FROM galleries AS g
            WHERE g.id = OLD.gallery_id
            AND ST_isEmpty(g.location::GEOMETRY) = FALSE
            AND s.id = OLD.story_id;
        RETURN OLD;
    END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION story_set_tsvector() RETURNS TRIGGER AS $$
    BEGIN
        UPDATE stories AS s
            SET _fts =  SETWEIGHT(TO_TSVECTOR('english', NEW.title), 'A') ||
                        SETWEIGHT(TO_TSVECTOR('english', NEW.caption), 'B') ||
                        SETWEIGHT(TO_TSVECTOR('english', ARRAY_TO_STRING(NEW.tags, ' ')), 'C')
            WHERE s.id = NEW.id;
        RETURN NEW;
    END
$$ LANGUAGE plpgsql;