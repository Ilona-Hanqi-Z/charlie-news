CREATE TABLE assignments (
    __mongo_id CHARACTER(24) DEFAULT NULL,
    __mongo_creator_id CHARACTER(24) DEFAULT NULL,
    __mongo_curator_id CHARACTER(24) DEFAULT NULL,
    __mongo_post_ids CHARACTER(24)[] DEFAULT NULL,
    
    id BIGSERIAL PRIMARY KEY,
    creator_id BIGINT DEFAULT NULL,-- NOT NULL,     MIGRATION-TODO: Reset to NOT NULL after migration
    curator_id BIGINT DEFAULT NULL,
    title TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    rating SMALLINT DEFAULT 0,
    radius INTEGER DEFAULT 0,
    location GEOGRAPHY DEFAULT NULL,
    location_buffered GEOGRAPHY DEFAULT NULL,
    address TEXT DEFAULT NULL,
    starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    approved_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    curated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    is_acceptable BOOLEAN NOT NULL DEFAULT false,

    _fts TSVECTOR DEFAULT NULL
);