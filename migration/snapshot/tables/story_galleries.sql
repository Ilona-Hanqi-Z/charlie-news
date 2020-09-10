-- Story's contained galleries
CREATE TABLE story_galleries (
    story_id BIGINT NOT NULL,
    gallery_id BIGINT NOT NULL,
    PRIMARY KEY(story_id, gallery_id)
);