# Pagos de Badreason

## Probar localmente

1. Copia `.env.example` a `.env.local`.
2. Genera una clave: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Guárdala en `PAYMENT_SECRET`.
3. Mantén `PAYMENT_MODE=sandbox`. Configura el token de prueba de Mercado Pago o las credenciales sandbox de PayPal.
4. Define `SHIPPING_CLP`: costo final de despacho que cobrará la tienda. `0` significa envío gratis. Un valor vacío bloquea los pagos.
5. Ejecuta `npm run dev`. Abre la URL que imprime Vite y visita `/pago`.

Vite guarda los pedidos en `.payments/orders.sqlite`. No se publica esa carpeta ni se guardan números de tarjeta, CVV o contraseñas bancarias. El catálogo, las tallas y el tipo de cambio se consultan nuevamente antes de cotizar; si no se pueden confirmar, se bloquea el cobro. La cotización dura 30 minutos. PayPal cobra en USD, con conversión explícita antes de continuar.

La transferencia requiere `TRANSFER_DETAILS` con los datos públicos del comercio. Genera una referencia persistente y queda en `pending_manual_review`; mostrar los datos bancarios nunca acredita un abono.

## Almacenamiento en Cloudflare

Para producción, crea una base D1 y agrega a `wrangler.jsonc` una entrada `d1_databases` con `binding: "PAYMENTS_DB"`, el nombre y el ID reales que entregue Cloudflare. Aplica `migrations/0001_payments.sql` a esa base. No se inventó un ID ni se creó infraestructura remota en este trabajo.

Configura los secretos en el Worker mediante el panel de Cloudflare o `wrangler secret put NOMBRE`. Las variables locales no se transfieren automáticamente al Worker. Configura `PUBLIC_ORIGIN` con el origen HTTPS exacto de tu tienda, sin barra final. Repite las pruebas sandbox antes de activar `PAYMENT_MODE=live` y reemplaza las credenciales de prueba por las de producción.

## Confirmación automática

Mercado Pago: configura notificaciones de pagos hacia `https://TU-DOMINIO/api/payments/webhooks/mercadopago` y guarda su clave de firma en `MP_WEBHOOK_SECRET`. La preferencia incluye esta URL cuando la tienda tiene HTTPS. Se verifica HMAC y antigüedad del evento; después se consulta el pago por API y se compara referencia, importe, moneda y entorno antes de guardar `paid`.

PayPal: registra `https://TU-DOMINIO/api/payments/webhooks/paypal`, suscríbelo a `CHECKOUT.ORDER.APPROVED` y `PAYMENT.CAPTURE.COMPLETED`, y configura `PAYPAL_WEBHOOK_ID`. La firma se verifica usando la API oficial. Una orden aprobada se captura con clave de idempotencia; una captura completada se consulta y verifica antes de guardar el pago. Repetir una notificación de un pedido pagado no lo cobra nuevamente.

Los proveedores no pueden enviar webhooks a tu localhost. Puedes probar el retorno del comprador localmente; las notificaciones necesitan una URL HTTPS accesible y configurada en la cuenta del proveedor. Los reembolsos, contracargos y cambios posteriores al pago todavía se gestionan en el panel del proveedor.

## Alcance y activación pendiente

Se implementaron Mercado Pago Checkout Pro, PayPal Orders v2, transferencia, pedidos persistentes y webhooks. No se ejecutaron cobros ni pruebas extremo a extremo contra cuentas reales: faltan las credenciales del propietario. Las pruebas automatizadas verifican seguridad, cotización, persistencia y confirmaciones con respuestas controladas.

Google Pay y Apple Pay aparecen deshabilitados con explicación. Requieren un procesador y cuenta elegibles; Google Pay mediante PayPal no incluye Chile en su lista actual de países admitidos. No basta con colocar un botón para cobrar. No se agregó una suscripción de software ni un intermediario adicional; siguen aplicando las comisiones y condiciones del proveedor elegido.

Antes de vender, el comercio debe definir despacho, impuestos/importación, condiciones de venta, disponibilidad real del proveedor y coordinación de entrega. No existe reserva de inventario en G5 ni automatización de despacho. El pago confirmado queda almacenado; el despacho se coordina por separado.

Fuentes oficiales:

- [Mercado Pago: preferencias](https://www.mercadopago.cl/developers/en/reference/online-payments/checkout-pro-preferences/overview)
- [Mercado Pago: firmas webhook](https://github.com/mercadopago/sdk-nodejs/blob/master/docs/webhooks.md)
- [PayPal: Orders API](https://developer.paypal.com/api/rest/integration/orders-api)
- [PayPal: webhooks](https://developer.paypal.com/api/rest/webhooks/)
- [Google Pay mediante PayPal: países y requisitos](https://developer.paypal.com/v5/google-pay/integrate/)
