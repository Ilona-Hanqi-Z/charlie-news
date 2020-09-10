ALTER TABLE oauth_clients
    ADD FOREIGN KEY (api_version_id) REFERENCES api_versions(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (role_id) REFERENCES roles(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (outlet_id) REFERENCES outlets(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (family_id) REFERENCES oauth_client_families(id)
        ON DELETE SET NULL;