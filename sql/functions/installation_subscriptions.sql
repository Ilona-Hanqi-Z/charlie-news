CREATE OR REPLACE FUNCTION clear_installation_subscriptions() RETURNS TRIGGER AS $$
    BEGIN
        DELETE FROM installation_subscriptions WHERE installation_id = NEW.id;
        RETURN NEW;
    END
$$ LANGUAGE plpgsql;