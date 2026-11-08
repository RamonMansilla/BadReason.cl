# Retomar Badreason desde el celular

Repositorio: https://github.com/RamonMansilla/BadReason.cl · Rama: `main` · Sitio: https://badreason.cl.

## Lo que ya está implementado

- Tienda en JavaScript y CSS con Vite; API en Cloudflare Worker.
- Categorías: Fútbol, Kids, Urbano, Running y Básquet, separando calzado y ropa.
- Treinta PNG generados de modelos reconocibles con marca, en `public/assets/hero/icons/`. No son fotografías oficiales de los productos.
- Textos, marca e imagen del banner sincronizados. Animación suave, navegación por deslizamiento táctil, mouse, clic lateral, flechas y teclado. El contador se quitó.
- Modo noche con cuatro paletas y configuración de idioma y apariencia desde una tuerca.
- Integraciones de Mercado Pago, PayPal y transferencia con validación en servidor, SQLite local, migración D1 y webhooks. La activación depende de las credenciales y configuración del comercio; no se han probado cobros reales.
- Treinta y una pruebas automatizadas pasaron en la última verificación del código.

## Archivos clave

| Qué cambiar | Archivo |
| --- | --- |
| Interfaz y navegación | `src/main.js` |
| Diseño y animación | `src/style.css` |
| Modelos y textos del banner | `public/data/hero-slides.json` |
| Grupos y fuentes de categorías | `public/data/collections.json` |
| Más vendidos de G5 | `functions/bestsellers.mjs` |
| Lectura del catálogo | `functions/catalog.mjs` |
| API publicada | `functions/worker.mjs` |
| Pagos | `functions/payments.mjs` y `PAYMENTS.md` |
| Publicación en .cl | `DESPLIEGUE.md` y `wrangler.jsonc` |

## Próximo trabajo acordado como idea, todavía no implementado

Guardar cada listado de G5 en su primera consulta del día, usando la fecha de Chile. Al día siguiente consultar nuevamente, comparar y actualizar solo productos o imágenes nuevos o modificados. Si el proveedor falla, conservar la última copia y mostrar su fecha.

Esto necesita almacenamiento persistente en Cloudflare. La caché actual de algunos endpoints vive pocos minutos en memoria: no es la caché diaria con comparación. G5 puede no responder desde los servidores de Cloudflare; la sección de más vendidos muestra un aviso en ese caso.

Antes de cobrar se debe volver a validar precio, talla y disponibilidad. No considerar un producto eliminado solo porque una consulta o una página del proveedor falló.

## Para pedir continuación a otro asistente

> Continúa el repositorio RamonMansilla/BadReason.cl, rama main. Lee CONTINUAR.md y DESPLIEGUE.md. El sitio ya se despliega con Cloudflare Workers Builds en badreason.cl. El siguiente trabajo es una caché diaria persistente de listados G5 con comparación incremental y respaldo ante fallos. Mantén las credenciales fuera de Git y conserva las funciones actuales de la tienda.
