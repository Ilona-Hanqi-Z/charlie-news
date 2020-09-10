-- Update the relevant gallery and story locations when a post with location data is added to the gallery
CREATE OR REPLACE FUNCTION gallery_posts_insert_propagate_location() RETURNS TRIGGER AS $$
    BEGIN
        UPDATE galleries AS g
            SET location = (SELECT ST_Multi(ST_CollectionExtract(ST_Union(g.location::GEOMETRY, p.location::GEOMETRY), 1)))
            FROM posts AS p
            WHERE p.id = NEW.post_id
            AND p.location IS NOT NULL
            AND g.id = NEW.gallery_id;
        UPDATE stories AS s
            SET location = (SELECT ST_Multi(ST_CollectionExtract(ST_Union(s.location::GEOMETRY, g.location::GEOMETRY), 1)))
            FROM galleries AS g,
            story_galleries AS sg
            WHERE g.id = NEW.gallery_id
            AND ST_isEmpty(g.location::GEOMETRY) = FALSE
            AND sg.gallery_id = NEW.gallery_id
            AND s.id = sg.story_id;
        RETURN NEW;
    END
$$ LANGUAGE plpgsql;

-- Update the relevant gallery and story locations when a post with location data is removed from the gallery
CREATE OR REPLACE FUNCTION gallery_posts_delete_propagate_location() RETURNS TRIGGER AS $$
    BEGIN
        UPDATE galleries AS g
            SET location = (SELECT ST_Multi(ST_CollectionExtract(ST_Difference(g.location::GEOMETRY, p.location::GEOMETRY), 1)))
            FROM posts AS p
            WHERE p.id = OLD.post_id
            AND p.location IS NOT NULL
            AND g.id = OLD.gallery_id;
        UPDATE stories AS s
            SET location = (SELECT ST_Multi(ST_CollectionExtract(ST_Difference(s.location::GEOMETRY, g.location::GEOMETRY), 1)))
            FROM galleries AS g,
            story_galleries AS sg
            WHERE g.id = OLD.gallery_id
            AND ST_isEmpty(g.location::GEOMETRY) = FALSE
            AND sg.gallery_id = OLD.gallery_id
            AND s.id = sg.story_id;
        RETURN OLD;
    END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION post_delete_propagate_location() RETURNS TRIGGER AS $$
    BEGIN
        UPDATE galleries AS g
            SET location = (SELECT ST_Multi(ST_CollectionExtract(ST_Difference(g.location::GEOMETRY, OLD.location::GEOMETRY), 1)))
            FROM gallery_posts AS gp
            WHERE gp.post_id = OLD.id
            AND g.id = gp.gallery_id;
        UPDATE stories AS s
            SET location = (SELECT ST_Multi(ST_CollectionExtract(ST_Difference(s.location::GEOMETRY, OLD.location::GEOMETRY), 1)))
            FROM story_galleries AS sg, gallery_posts AS gp
            WHERE gp.post_id = OLD.id
            AND sg.gallery_id = gp.gallery_id
            AND s.id = sg.story_id;
        RETURN OLD;
    END
$$ LANGUAGE plpgsql;

-- Assumes OLD and NEW are different, and/or have different location columns
CREATE OR REPLACE FUNCTION modify_post_propagate_location() RETURNS TRIGGER AS $$
    BEGIN
        IF NEW.location IS NULL -- If the post is being deleted or location is being unset
        THEN
            UPDATE galleries AS g
                SET location = (SELECT ST_Multi(ST_CollectionExtract(ST_Difference(g.location::GEOMETRY, OLD.location::GEOMETRY), 1)))
                FROM gallery_posts AS gp
                WHERE gp.post_id = OLD.id
                AND g.id = gp.gallery_id;
            UPDATE stories AS s
                SET location = (SELECT ST_Multi(ST_CollectionExtract(ST_Difference(s.location::GEOMETRY, OLD.location::GEOMETRY), 1)))
                FROM story_galleries AS sg, gallery_posts AS gp
                WHERE gp.post_id = OLD.id
                AND sg.gallery_id = gp.gallery_id
                AND s.id = sg.story_id;
        ELSIF OLD.location IS NULL -- If a location is being set from null
        THEN
            UPDATE galleries AS g
                SET location = (SELECT ST_Multi(ST_CollectionExtract(ST_Union(g.location::GEOMETRY, NEW.location::GEOMETRY), 1)))
                FROM gallery_posts AS gp
                WHERE gp.post_id = NEW.id
                AND g.id = gp.gallery_id;
            UPDATE stories AS s
                SET location = (SELECT ST_Multi(ST_CollectionExtract(ST_Union(s.location::GEOMETRY, NEW.location::GEOMETRY), 1)))
                FROM story_galleries AS sg, gallery_posts AS gp
                WHERE gp.post_id = NEW.id
                AND sg.gallery_id = gp.gallery_id
                AND s.id = sg.story_id;
        ELSE -- If the location is being updated from an old existing value
            UPDATE galleries AS g
                SET location = (SELECT ST_Multi(ST_CollectionExtract(ST_Union(ST_Difference(g.location::GEOMETRY, OLD.location::GEOMETRY), NEW.location::GEOMETRY), 1)))
                FROM gallery_posts AS gp
                WHERE gp.post_id = NEW.id
                AND g.id = gp.gallery_id;
            UPDATE stories AS s
                SET location = (SELECT ST_Multi(ST_CollectionExtract(ST_Union(ST_Difference(s.location::GEOMETRY, OLD.location::GEOMETRY), NEW.location::GEOMETRY), 1)))
                FROM story_galleries AS sg, gallery_posts AS gp
                WHERE gp.post_id = NEW.id
                AND sg.gallery_id = gp.gallery_id
                AND s.id = sg.story_id;
        END IF;
        RETURN NEW;
    END
$$ LANGUAGE plpgsql;

-- Keeps post ordering consistent in galleries
CREATE OR REPLACE FUNCTION update_post_order() RETURNS TRIGGER AS $$
    DECLARE
        post INTEGER;
        counter INTEGER = 0;
        gallery INTEGER;
    BEGIN
        IF TG_OP = 'INSERT' THEN
            gallery = NEW.gallery_id;
        ELSIF TG_OP = 'DELETE' THEN
            gallery = OLD.gallery_id;
        END IF;

        FOR post IN SELECT post_id FROM gallery_posts WHERE gallery_id = gallery ORDER BY position ASC NULLS LAST LOOP
            UPDATE gallery_posts SET position = counter WHERE gallery_id = gallery AND post_id = post;
            counter = counter + 1;
        END LOOP;
        RETURN NEW;
    END;
$$ LANGUAGE plpgsql;