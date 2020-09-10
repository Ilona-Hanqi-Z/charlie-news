ALTER TABLE story_articles
    ADD FOREIGN KEY (story_id) REFERENCES stories(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (article_id) REFERENCES articles(id)
        ON DELETE CASCADE;