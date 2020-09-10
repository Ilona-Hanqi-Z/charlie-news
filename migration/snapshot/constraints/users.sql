ALTER TABLE users
    ADD FOREIGN KEY (outlet_id) REFERENCES outlets(id)
        ON DELETE SET NULL;

CREATE UNIQUE INDEX unique_email ON users(LOWER(email));
CREATE UNIQUE INDEX unique_username ON users(LOWER(username));