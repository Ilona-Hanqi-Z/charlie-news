CREATE TABLE galleries (
    __mongo_id CHARACTER(24) DEFAULT NULL,
    __mongo_owner_id CHARACTER(24) DEFAULT NULL,
    __mongo_curator_id CHARACTER(24) DEFAULT NULL,
    __mongo_post_ids CHARACTER(24)[] DEFAULT NULL,
    __mongo_article_ids CHARACTER(24)[] DEFAULT NULL,

    id BIGSERIAL PRIMARY KEY,
    owner_id BIGINT DEFAULT NULL,
    curator_id BIGINT DEFAULT NULL,
    importer_id BIGINT DEFAULT NULL,
    editorial_caption TEXT DEFAULT NULL,
    caption TEXT NOT NULL DEFAULT '',
    address TEXT,
    location GEOGRAPHY(MultiPoint) DEFAULT ST_geogFromText('MULTIPOINT EMPTY'),
    tags CHARACTER VARYING(32)[] DEFAULT '{}',
    external_id TEXT DEFAULT NULL,
    external_url CHARACTER VARYING(255) DEFAULT NULL,
    external_account_id TEXT DEFAULT NULL,
    external_account_username CHARACTER VARYING(64) DEFAULT NULL,
    external_account_name CHARACTER VARYING(64) DEFAULT NULL,
    external_source CHARACTER VARYING(16) DEFAULT NULL,
    is_nsfw BOOLEAN DEFAULT FALSE,
    rating SMALLINT NOT NULL DEFAULT 0,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    highlighted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,

    _fts TSVECTOR DEFAULT NULL,

    CONSTRAINT social_import_exists UNIQUE(external_source, external_id)
);
-- TODO:
-- INDEX address
-- INDEX EXTERNAL_ID (AND EXTERNAL_SOURCE?)
-- INDEX rating