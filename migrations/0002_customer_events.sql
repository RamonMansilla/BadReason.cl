-- Datos de entrega del comprador, último evento del proveedor y avisos enviados.
ALTER TABLE payment_orders ADD COLUMN customer TEXT;
ALTER TABLE payment_orders ADD COLUMN last_event TEXT;
ALTER TABLE payment_orders ADD COLUMN notified TEXT;
CREATE INDEX IF NOT EXISTS payment_orders_status ON payment_orders(status,created_at);
