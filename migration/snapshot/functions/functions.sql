CREATE OR REPLACE FUNCTION plainto_or_tsquery (TEXT) RETURNS tsquery AS $$
    BEGIN
        RETURN TO_TSQUERY('english', REGEXP_REPLACE($1, E'[\\s\'|:&()!]+','|','g'));
    END
$$ LANGUAGE plpgsql STRICT IMMUTABLE;

\i ./functions/articles.sql
\i ./functions/assignments.sql
\i ./functions/galleries.sql
\i ./functions/installation_subscriptions.sql
\i ./functions/outlet_payment.sql
\i ./functions/outlets.sql
\i ./functions/posts.sql
\i ./functions/stories.sql
\i ./functions/user_payment.sql
\i ./functions/users.sql
