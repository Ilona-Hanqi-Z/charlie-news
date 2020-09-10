CREATE OR REPLACE FUNCTION user_set_tsvector() RETURNS TRIGGER AS $$
    BEGIN
        UPDATE users AS u
            SET _fts =  SETWEIGHT(TO_TSVECTOR('english', COALESCE(NEW.email, '') || ' ' || COALESCE(NEW.full_name, '') || ' ' || COALESCE(NEW.username, '')), 'A') ||
                        SETWEIGHT(TO_TSVECTOR('english', COALESCE(NEW.location, '') || ' ' || COALESCE(NEW.bio, '')), 'B')
            WHERE u.id = NEW.id;
        RETURN NEW;
    END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_user_activity(BIGINT, INT, INTERVAL) RETURNS REAL AS $$
    DECLARE
        user_id ALIAS FOR $1;
        post_count ALIAS FOR $2;
        rating REAL;
        created_since INT;
    BEGIN
	created_since = EXTRACT(EPOCH FROM $3);
        SELECT
            SUM((created_since - LEAST(seconds, created_since)) / created_since) / post_count INTO rating
            FROM (
                SELECT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP - created_at) AS seconds
                FROM posts
                WHERE
                    owner_id = user_id
                    AND status > 1
                    AND posts.rating > 1
                ORDER BY created_at DESC
                LIMIT post_count
            ) posts;
        RETURN rating;
    END
$$ LANGUAGE plpgsql;