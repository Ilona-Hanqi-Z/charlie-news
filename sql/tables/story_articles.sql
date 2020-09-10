-- Story's related articles
CREATE TABLE story_articles (
    story_id BIGINT NOT NULL,
    article_id BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(story_id, article_id)
);