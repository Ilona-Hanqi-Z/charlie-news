ALTER TABLE gallery_articles
    ADD FOREIGN KEY (gallery_id) REFERENCES galleries(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (article_id) REFERENCES articles(id)
        ON DELETE CASCADE;