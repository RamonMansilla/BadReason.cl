# Badreason

Tienda local preparada para Firebase Hosting + Cloud Functions. La marca es Badreason; la ficha y la estructura de navegación toman como referencia el HAR de Moredrops. Productos, categorías, imágenes, tallas y precios se consultan en G5.

## Ejecutar

Recomendado: Node.js 22 (la función se despliega con ese runtime).

```sh
npm ci
npm ci --prefix functions
npm run dev
```

Abrir http://127.0.0.1:5173. Vite sirve también `/api` durante desarrollo.

```sh
npm test
npm run build
```

`npm run preview` sólo sirve los archivos estáticos: para probar también la API usar desarrollo o Firebase Emulator Suite.

## Firebase

`firebase.json` sirve `dist`, dirige `/api/**` a la función `api` en `us-central1` y las rutas restantes a `index.html`. `.firebaserc` apunta a `badreason-42b74`; revisar este identificador antes de desplegar.

Con Firebase CLI disponible y una sesión autorizada:

```sh
npm run build
firebase emulators:start --only hosting,functions
firebase deploy --only hosting,functions
```

No se ha publicado ni modificado el proyecto remoto. Cloud Functions requiere tener habilitada la facturación correspondiente en Firebase. No hacen falta credenciales privadas de G5: el adaptador lee las páginas públicas del proveedor. No se incluyeron cookies, tokens ni los HAR completos en el repositorio.

## Páginas y comportamiento

- `/`: inicio editorial Badreason; consulta la selección actual de G5 y utiliza la captura identificada como referencia si falla el proveedor.
- `/catalogo`: catálogo G5 con ordenamiento, categorías y paginación.
- `/catalogo?category=/product-category/adidas/`: cualquier categoría del menú G5.
- `/categorias`: 310 categorías extraídas del HAR, con filtro por nombre.
- `/buscar?q=jordan`: búsqueda contra G5, con paginación.
- `/producto/:slug`: ficha, imágenes, opciones reales de talla, disponibilidad y carrito.
- `/carrito`: selección persistente en este navegador, cantidades, eliminación y descarga JSON.
- `/ayuda` y `/informacion`: explicación de moneda, disponibilidad y funcionamiento.
- Rutas desconocidas: pantalla 404.

Marcas abre un menú con cuatro grupos. Cada grupo expande su contenido con transición de altura y aparición escalonada de las filas. Los productos también aparecen por filas. Se respeta `prefers-reduced-motion`.

## Datos y precio

El adaptador vive en `functions/catalog.mjs` y la API en `functions/api.mjs`. Ante una oferta se usa el precio vigente de `ins`, no el tachado. El 30% se aplica una sola vez y se redondea el resultado final a pesos enteros. El importe final es `Math.round(precioVigenteUSD * 1.30 * tasaUSDCLP)`. Se muestran pesos chilenos sin decimales en todos los listados, fichas, carrito y exportación. La tasa se consulta en https://mindicador.cl/api/dolar, con caché de seis horas. Si falla, se usa la última tasa en memoria o la referencia versionada de `functions/exchange-rate.json`: 970,94 CLP por USD, del 6 de noviembre de 2026. Ejemplo: USD 39 → $49.227 CLP. Los carritos antiguos en USD se migran una sola vez a CLP. Despacho, impuestos e importación no se calculan.

La API restringe las solicitudes al dominio G5, valida rutas, rechaza redirecciones, limita páginas y búsquedas, y aplica tiempo máximo de espera. La función utiliza caché HTTP breve para las lecturas. Al depender del HTML de G5, cambios de su estructura pueden requerir actualizar el adaptador.

`public/data/catalog.json` contiene únicamente una captura de 20 productos Air Jordan y las categorías. Ante una caída de G5 se muestra este respaldo sólo para la categoría capturada; se identifica como referencia y no permite agregar productos sin verificar su disponibilidad. Otras categorías muestran error y permiten reintentar. El menú de categorías procede de la captura y debe reimportarse para incorporar nuevas categorías.

Para volver a importar un HAR local, sin almacenar cookies ni sesiones:

```sh
node scripts/import-har.mjs "RUTA_AL_HAR_G5"
```

## Alcance de las referencias y pendientes

El HAR de Moredrops contiene una ficha de Air Max 95, no la navegación completa del sitio. La ficha se adaptó a Badreason; las páginas no capturadas se construyeron siguiendo ese lenguaje de tienda, sin afirmar que son copias exactas de páginas ausentes.

El carrito es local. No hay pasarela, cobros, pedidos en servidor, cuentas ni despacho configurado. La descarga representa una selección, no una compra. Antes de habilitar pagos se debe definir la operación comercial y validar precios y variantes nuevamente en el servidor.

## Verificación

Las pruebas automatizadas cubren precio con oferta y recargo, importación, tallas, falta de stock, validación de rutas, navegación, persistencia del carrito y respaldo ante errores. Se verificaron llamadas reales a Air Jordan, Nike, Adidas, New Balance, búsqueda y ficha de G5. La compilación de producción y la carga del export de Firebase pasaron.

No se pudo completar la inspección visual en navegador: las herramientas del entorno fallaron al inicializar con `failed to write kernel assets` (ruta no encontrada). Las pruebas de interacción usan JSDOM; no sustituyen la inspección de disposición y animación en un navegador real.

La auditoría de dependencias detectó seis avisos moderados transitivos en el árbol de Firebase Admin (glob/minimatch y dependientes). Se actualizó Firebase Functions y se aplicaron las correcciones compatibles disponibles; `npm audit fix` todavía informa esos avisos. Revisarlos antes del despliegue definitivo.

## Estado de publicación (7 de noviembre de 2026)

Remoto Git: https://github.com/RamonMansilla/BadReason.cl, rama main. El commit local conserva el historial inicial del repositorio. La cuenta `RamonMansilla` del conector de GitHub tiene permisos de escritura. La sincronización se realiza mediante el conector, conservando el árbol de archivos verificado localmente.

No se encontraron credenciales locales de Firebase. El proyecto y Hosting responden en `https://badreason-42b74.web.app` y `https://badreason.cl`, todavía con la versión anterior. `www.badreason.cl` resuelve por CNAME a `badreason.cl`, pero su certificado HTTPS no incluye el nombre www. Agregar/verificar `www.badreason.cl` en Firebase Hosting > Dominios personalizados y esperar el aprovisionamiento del certificado. No se modificaron DNS ni dominios remotos.

Después de autenticar Firebase con una cuenta administradora del proyecto:

```sh
firebase login
firebase deploy --only hosting,functions --project badreason-42b74
```
