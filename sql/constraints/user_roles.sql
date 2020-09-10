ALTER TABLE user_roles
    ADD FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (role_id) REFERENCES roles(id)
        ON DELETE CASCADE;