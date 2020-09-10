ALTER TABLE oauth_authorization_codes
    ADD FOREIGN KEY (client_id) REFERENCES oauth_clients(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (role_id) REFERENCES roles(id)
        ON DELETE CASCADE;