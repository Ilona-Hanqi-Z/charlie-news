ALTER TABLE oauth_access_tokens
    ADD FOREIGN KEY (client_id) REFERENCES oauth_clients(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (role_id) REFERENCES roles(id)
        ON DELETE CASCADE;