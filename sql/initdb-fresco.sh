#!/bin/sh

export PGUSER="$POSTGRES_USER"

cd /usr/src/db

psql -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f index.sql
psql -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f test_data.sql
