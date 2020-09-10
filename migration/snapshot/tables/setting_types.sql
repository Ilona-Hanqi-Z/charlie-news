CREATE TABLE setting_types (
    type CHARACTER VARYING(40) NOT NULL PRIMARY KEY,
    description CHARACTER VARYING(256) DEFAULT NULL,
    title CHARACTER VARYING(256) DEFAULT NULL,
    options_default JSONB NOT NULL DEFAULT '{ "enabled": false }'
);