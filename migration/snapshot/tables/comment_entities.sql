CREATE TABLE comment_entities (
    comment_id BIGINT NOT NULL,
    entity_id BIGINT DEFAULT NULL,
    entity_type VARCHAR(16) NOT NULL,
    text CHARACTER VARYING(255) NOT NULL,
    start_index INT DEFAULT NULL,
    end_index INT DEFAULT NULL
);