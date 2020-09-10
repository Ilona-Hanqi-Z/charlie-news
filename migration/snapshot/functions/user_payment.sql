-- Ensures only one user payment method is default
CREATE OR REPLACE FUNCTION user_payment_update_default_method() RETURNS TRIGGER AS $$
    BEGIN
        UPDATE user_payment AS up
            SET active = FALSE
            WHERE
                up.user_id = NEW.user_id
                AND up.id != NEW.id;
        RETURN NEW;
    END
$$ LANGUAGE plpgsql;