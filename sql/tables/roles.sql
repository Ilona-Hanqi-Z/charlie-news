CREATE TABLE roles (
    id BIGSERIAL PRIMARY KEY,
    entity TEXT NOT NULL,
    tag TEXT NOT NULL,
    name TEXT DEFAULT NULL,
    scopes TEXT[] DEFAULT '{}',

    CONSTRAINT unique_roles UNIQUE (tag)
);