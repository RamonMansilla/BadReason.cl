# Badreason

Tienda de sneakers Badreason: interfaz basada en la ficha de Moredrops y catálogo consultado en G5. El sitio y su API se publican juntos como Cloudflare Worker con assets estáticos. Firebase ya no hace falta para este despliegue ni se requieren Cloud Functions.

## Desarrollo

Requiere Node.js 22 o superior.

```sh
npm ci
npm run dev
```

Vite sirve la tienda en `http://127.0.0.1:5173` y consulta la API de desarrollo en `/api`.

```sh
npm run build
npm run dev:worker
npm run deploy:worker
```

`npm run build` genera los assets en `dist`. `npm run dev:worker` compila y abre Wrangler local con el Worker y las rutas SPA. `npm run deploy:worker` construye y publica en Cloudflare; requiere iniciar sesión con Wrangler.

## Cloudflare Workers Builds con GitHub

El repositorio está en `https://github.com/RamonMansilla/BadReason.cl`, rama `main`. Ya incluye `wrangler.jsonc`, el Worker API y el build de Vite. En Cloudflare abre **Workers & Pages > Create application > Connect to Git** y selecciona ese repositorio. Configura:

- Worker name: `badreason` (debe coincidir con `wrangler.jsonc`).
- Production branch: `main`.
- Root directory: `/`.
- Build command: `npm ci && npm run build`.
- Deploy command: `npx wrangler deploy`.

Cloudflare publica primero en su dominio `workers.dev`; los cambios siguientes en `main` reconstruyen y despliegan automáticamente.

## Dominio badreason.cl

Para servir en `www.badreason.cl` o `badreason.cl` desde Workers, el dominio debe estar activo como una zona de Cloudflare y el Worker debe vincularse a un hostname personalizado. La zona actual aún apunta a Firebase. No se han modificado DNS, nameservers ni certificados. No cambies los nameservers sin revisar y copiar antes todos los registros DNS existentes, incluidos correo y verificaciones. Valida primero la dirección `workers.dev`; conecta el dominio después desde **Workers & Pages > badreason > Settings > Domains & Routes > Add > Custom Domain**.

## API y precios

`functions/worker.mjs` valida solicitudes y obtiene las páginas públicas de G5. `functions/catalog.mjs` interpreta catálogo, productos, tallas y categorías. `functions/pricing.mjs` aplica un recargo de 30% y convierte a CLP usando la tasa USD/CLP de Mindicador, almacenada en caché seis horas y con respaldo versionado.

El Worker sirve las páginas de la SPA para rutas como `/catalogo`, `/categorias`, `/producto/:slug` y `/carrito`; `/api/*` pasa por el Worker. La búsqueda, las fichas y las categorías usan la misma URL de origen. Las solicitudes a activos estáticos no se facturan como invocaciones del Worker. En el plan gratuito, las rutas dinámicas que usan `/api/*` comparten el límite actual de 100.000 solicitudes diarias.

La respuesta de G5 puede cambiar de estructura. Si G5 o el proveedor de tipo de cambio no responden, la API usa respaldo de catálogo o tasa cuando corresponde y comunica la falta de datos de manera explícita. La disponibilidad y los valores deben consultarse nuevamente antes de habilitar pagos.

## Compras

El carrito guarda una selección en este navegador. El pago, pedidos en servidor, cuentas e información de despacho aún no están configurados. El botón de descarga exporta una selección, no una compra.

## Fuentes y alcance

El HAR de Moredrops contiene una ficha Air Max 95 y el HAR de G5 una categoría Air Jordan, no todas las páginas de esas tiendas. La página usa la ficha y las categorías capturadas como referencias; los precios y datos actuales se consultan en G5.

Cloudflare documenta el despliegue Git en [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), los assets para SPA en [Static Assets](https://developers.cloudflare.com/workers/static-assets/) y los requisitos de dominio en [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
