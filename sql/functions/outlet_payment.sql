-- Ensures only one outlet payment method is default
CREATE OR REPLACE FUNCTION outlet_payment_update_default_method() RETURNS TRIGGER AS $$
    BEGIN
        UPDATE outlet_payment AS op
            SET active = FALSE
            WHERE op.outlet_id = NEW.outlet_id
            AND op.active = TRUE;
        RETURN NEW;
    END
$$ LANGUAGE plpgsql;