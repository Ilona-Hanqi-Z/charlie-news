-- Unset other outlet default payment methods if setting one to default
DROP TRIGGER IF EXISTS outlet_payment_update_default_method ON user_payment;
CREATE TRIGGER outlet_payment_update_default_method
    BEFORE INSERT OR UPDATE ON outlet_payment
    FOR EACH ROW
    WHEN (NEW.active)
    EXECUTE PROCEDURE outlet_payment_update_default_method();