-- Update gallery and story location data when adding post to gallery
DROP TRIGGER IF EXISTS gallery_posts_insert_propagate_location ON gallery_posts;
CREATE TRIGGER gallery_posts_insert_propagate_location
    BEFORE INSERT ON gallery_posts
    FOR EACH ROW
    EXECUTE PROCEDURE gallery_posts_insert_propagate_location();

-- Update gallery and story location data when removing a post from a gallery
DROP TRIGGER IF EXISTS gallery_posts_delete_propagate_location ON gallery_posts;
CREATE TRIGGER gallery_posts_delete_propagate_location
    BEFORE DELETE ON gallery_posts
    FOR EACH ROW
    EXECUTE PROCEDURE gallery_posts_delete_propagate_location();

DROP TRIGGER IF EXISTS gallery_posts_order ON gallery_posts;
CREATE TRIGGER gallery_posts_order
    AFTER INSERT OR DELETE ON gallery_posts
    FOR EACH ROW
    EXECUTE PROCEDURE update_post_order();