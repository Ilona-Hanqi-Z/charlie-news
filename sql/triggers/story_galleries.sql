-- Update story location data when adding gallery
DROP TRIGGER IF EXISTS story_galleries_insert_propagate_location ON story_galleries;
CREATE TRIGGER story_galleries_insert_propagate_location
    BEFORE INSERT ON story_galleries
    FOR EACH ROW
    EXECUTE PROCEDURE story_galleries_insert_propagate_location();

-- Update story location data when removing gallery
DROP TRIGGER IF EXISTS story_galleries_delete_propagate_location ON story_galleries;
CREATE TRIGGER story_galleries_delete_propagate_location
    BEFORE DELETE ON story_galleries
    FOR EACH ROW
    EXECUTE PROCEDURE story_galleries_delete_propagate_location();