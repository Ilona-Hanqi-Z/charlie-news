ALTER TABLE assignment_outlets
    ADD FOREIGN KEY (assignment_id) REFERENCES assignments(id)
        ON DELETE CASCADE,
    ADD FOREIGN KEY (outlet_id) REFERENCES outlets(id)
        ON DELETE CASCADE;