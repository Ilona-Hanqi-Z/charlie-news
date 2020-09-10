CREATE TABLE recaps (
    __mongo_id CHARACTER(24) DEFAULT NULL,
    __mongo_story_ids CHARACTER(24)[] DEFAULT NULL,
    
    id          BIGSERIAL PRIMARY KEY,
    title       CHARACTER VARYING(80),
    caption     CHARACTER VARYING(1500) DEFAULT '',
    job_id      CHARACTER VARYING(32),
    image       TEXT NOT NULL,
    video       TEXT NOT NULL,
    stream      TEXT NOT NULL,
    tags        CHARACTER VARYING(32)[] DEFAULT '{}',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    
    _fts TSVECTOR DEFAULT NULL
);