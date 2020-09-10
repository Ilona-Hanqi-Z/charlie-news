-- psql -h fresc-dev-v2-db.crvi5efllyvf.us-east-1.rds.amazonaws.com -p 6859 -d devdb -U frescodevdbuser -f index.sql
-- psql -h migration-test.crvi5efllyvf.us-east-1.rds.amazonaws.com:6859 -p 6859 -d devdb -U frescodevdbuser -f index.sql
-- psql -h fresco2-prod-db.crvi5efllyvf.us-east-1.rds.amazonaws.com -p 6859 -d frescoProd -U frescoproddbuser -f index.sql
\i ./tables/tables.sql

\i ./indices/indices.sql
\i ./constraints/constraints.sql
\i ./functions/functions.sql
\i ./triggers/triggers.sql
