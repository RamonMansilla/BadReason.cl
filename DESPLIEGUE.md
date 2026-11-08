# Publicar Badreason en badreason.cl

## Estado comprobado

- Código: https://github.com/RamonMansilla/BadReason.cl
- Rama de producción: `main`.
- Alojamiento: Cloudflare Workers, servicio `badreason`.
- Sitio: https://badreason.cl y https://www.badreason.cl.
- Los cambios enviados a `main` activan **Workers Builds: badreason**. Se verificó un despliegue correcto el 8 de noviembre de 2026.
- El dominio ya está conectado. Para publicar cambios normales no se modifican DNS ni nameservers.

## Publicar desde el celular

1. Inicia sesión en GitHub con la cuenta que tiene acceso al repositorio.
2. Abre el repositorio y la rama `main` desde la aplicación de GitHub o su web.
3. Lee [CONTINUAR.md](CONTINUAR.md) para conocer el estado del proyecto. Para cambios pequeños puedes editar un archivo desde la web de GitHub y guardar el commit en `main`.
4. En el commit, revisa el resultado **Workers Builds: badreason**. También puedes verlo en Cloudflare → Workers & Pages → badreason → Builds.
5. Espera a que termine correctamente y comprueba https://badreason.cl. Si ves la versión anterior, recarga la página.

Para cambios de código que necesiten pruebas, usa un entorno de desarrollo con Node.js; guardar un commit desde GitHub móvil no ejecuta por sí solo las pruebas locales. Los comandos de Cloudflare se ejecutan en su servidor de compilación.

## Configuración de Workers Builds

Si debes reconstruir la integración, conecta este repositorio desde el panel de Cloudflare. No crees otro Worker con un nombre distinto para reemplazar el existente.

| Campo | Valor |
| --- | --- |
| Worker | `badreason` |
| Rama de producción | `main` |
| Directorio raíz | `/` |
| Comando de build | `npm ci && npm run build` |
| Comando de despliegue | `npx wrangler deploy` |
| Configuración | `wrangler.jsonc` |
| Módulo del Worker | `functions/worker.mjs` |
| Archivos estáticos | `dist/`, binding `ASSETS` |

Si el repositorio es privado, la aplicación de Cloudflare instalada en GitHub debe seguir teniendo acceso a `BadReason.cl`. Si un build falla por permisos, revisa esa instalación en GitHub y la conexión Git de Workers Builds. No es necesario hacer público el repositorio para mantener pública la tienda.

## Desarrollo y publicación desde un computador

Recomendado: Node.js 24, versión usada durante el desarrollo. Ejecuta desde la raíz del repositorio:

```sh
npm ci
npm run dev
```

Antes de subir cambios de código:

```sh
npm test
npm run build
git add RUTAS_DE_LOS_ARCHIVOS_CAMBIADOS
git commit -m "Describe el cambio"
git push origin main
```

Para publicar directamente con Wrangler en vez de la integración Git:

```sh
npx wrangler login
npm run deploy:worker
```

Debes entrar a la cuenta de Cloudflare que administra `badreason`. Si Git o Wrangler no tienen sesión, autentícate por su flujo oficial. Nunca pegues tokens o contraseñas en archivos del repositorio.

## Dominio y recuperación

Los hostnames `badreason.cl` y `www.badreason.cl` se administran en Cloudflare → Workers & Pages → badreason → Settings → Domains & Routes. Mantén los registros de correo y las verificaciones existentes. La publicación de código no requiere cambiar la zona DNS.

Si una versión de código falla, restaura los archivos mediante un nuevo commit o usa el rollback de deployments del Worker. No borres el repositorio ni el Worker para reparar un build.

## Pagos y secretos

Consulta [PAYMENTS.md](PAYMENTS.md). La interfaz está implementada, pero el cobro requiere las credenciales del comercio, el despacho definido y una base D1 vinculada como `PAYMENTS_DB`. La migración está en `migrations/0001_payments.sql`.

`.env.local`, `.payments/`, credenciales y la base SQLite local quedan fuera de Git. Guarda los secretos de producción en Cloudflare. Hacer privado el repositorio no convierte al sitio web en privado.

## Fuentes oficiales

- [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Dominios personalizados de Workers](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
