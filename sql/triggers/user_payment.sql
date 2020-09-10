-- Unset other user default payment methods if setting one to default
DROP TRIGGER IF EXISTS user_payment_update_default_method ON user_payment;
CREATE TRIGGER user_payment_update_default_method
    BEFORE INSERT OR UPDATE ON user_payment
    FOR EACH ROW
    WHEN (NEW.active)
    EXECUTE PROCEDURE user_payment_update_default_method();