CREATE TABLE stories (
    __mongo_id CHARACTER(24) DEFAULT NULL,
    __mongo_curator_id CHARACTER(24) DEFAULT NULL,
    __mongo_gallery_ids CHARACTER(24)[] DEFAULT NULL,
    __mongo_article_ids CHARACTER(24)[] DEFAULT NULL,
    
    id BIGSERIAL PRIMARY KEY,
    curator_id  BIGINT DEFAULT NULL,
    title       CHARACTER VARYING(60) NOT NULL,
    caption     CHARACTER VARYING(1500) NOT NULL DEFAULT '',
    tags        CHARACTER VARYING(32)[] DEFAULT '{}',
    location    GEOGRAPHY(MultiPoint) DEFAULT ST_geogFromText('MULTIPOINT EMPTY'),
    -- updates     TEXT[]      NOT NULL DEFAULT '{}',
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    _fts TSVECTOR DEFAULT NULL
);
--TODO admin action table?