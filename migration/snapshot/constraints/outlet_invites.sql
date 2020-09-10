CREATE UNIQUE INDEX outlet_invite_unique ON outlet_invites(outlet_id, email) WHERE (used = FALSE);
ALTER TABLE outlet_invites
    ADD FOREIGN KEY (outlet_id) REFERENCES outlets(id)
        ON DELETE CASCADE;