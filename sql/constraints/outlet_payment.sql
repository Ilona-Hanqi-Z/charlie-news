ALTER TABLE outlet_payment
    ADD FOREIGN KEY (outlet_id) REFERENCES outlets(id)
        ON DELETE CASCADE;