-- Gallery's related articles
CREATE TABLE gallery_articles (
    gallery_id BIGINT NOT NULL,
    article_id BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(gallery_id, article_id)
);