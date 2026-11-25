import { getExchangeRate } from './pricing.mjs';
import { parseCatalog, parseProduct } from './catalog.mjs';
import { payments } from './payments.mjs';
import { getBestsellers } from './bestsellers.mjs';
import { getCollection,productImage } from './collections.mjs';
import { rateLimit } from './ratelimit.mjs';

// Cabeceras para respuestas generadas por el Worker. Las páginas estáticas las reciben desde public/_headers.
export const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

function withSecurity(response) {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(securityHeaders)) {
    if (name === 'Content-Security-Policy' && !/json|text\/plain/.test(secured.headers.get('Content-Type') || '')) continue;
    secured.headers.set(name, value);
  }
  return secured;
}

// Copia de respaldo de cada listado de G5 en la caché del centro de datos de Cloudflare.
// Si G5 falla, se entrega la última copia correcta (hasta 7 días) marcada con stale: true.
const backupAge = 7 * 24 * 60 * 60;
const cacheable = path => path === '/catalog' || path === '/search' || path === '/collection' || path === '/bestsellers' || path.startsWith('/product/');
async function withBackup(request, handler) {
  const path = new URL(request.url).pathname.replace(/^\/api/, '');
  const cache = globalThis.caches?.default;
  if (!cache || request.method !== 'GET' || !cacheable(path)) return handler();
  const key = new Request(new URL(request.url).href.replace('/api/', '/__g5-backup/'), { method: 'GET' });
  const response = await handler();
  if (response.ok) {
    const copy = new Response(response.clone().body, response);
    copy.headers.set('Cache-Control', `public, max-age=${backupAge}`);
    try { await cache.put(key, copy); } catch {}
    return response;
  }
  if (response.status !== 502) return response;
  try {
    const saved = await cache.match(key);
    if (!saved) return response;
    const data = await saved.json();
    return json({ ...data, stale: true });
  } catch { return response; }
}

const origin = 'https://www.g5sneaker.ru';
const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=120, s-maxage=300',
  'X-Content-Type-Options': 'nosniff',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

async function api(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '');
  let target;
  let product = false;

  if (request.method !== 'GET') return json({ error: 'Método no permitido' }, 405);
  if(path==='/product-image')return productImage(request);
  if(path==='/collection'){try{return json(await getCollection(url.searchParams.get('group'),url.searchParams.get('kind')||'shoes',url.searchParams.get('page')));}catch(e){return json({error:e.status?e.message:'No se pudo consultar esta colección de G5.'},e.status||502);}}
  if (path === '/bestsellers') {
    try { return json(await getBestsellers()); }
    catch { return json({ error: 'No se pudieron consultar los más vendidos de G5.' }, 502); }
  }

  if (path === '/catalog') {
    const category = url.searchParams.get('category') || '/product-category/air-jordan/';
    if (!/^\/product-category\/(?:[a-z0-9-]+\/)+$/.test(category)) {
      return json({ error: 'Categoría inválida' }, 400);
    }
    const page = Math.max(1, Math.min(500, Math.floor(Number(url.searchParams.get('page')) || 1)));
    target = origin + category + (page > 1 ? `page/${page}/` : '');
  } else if (path === '/search') {
    const query = (url.searchParams.get('q') || '').trim();
    if (!query || query.length > 100) return json({ error: 'Búsqueda inválida' }, 400);
    const page = Math.max(1, Math.min(500, Math.floor(Number(url.searchParams.get('page')) || 1)));
    target = `${origin}/?${new URLSearchParams({ s: query, post_type: 'product', paged: String(page) })}`;
  } else if (path.startsWith('/product/')) {
    const id = path.slice('/product/'.length);
    if (!/^[a-z0-9-]+$/.test(id)) return json({ error: 'Producto inválido' }, 400);
    target = `${origin}/product/${id}/`;
    product = true;
  } else {
    return json({ error: 'Ruta no encontrada' }, 404);
  }

  try {
    const upstream = await fetch(target, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'BadreasonCatalog/1.0' },
      redirect: 'manual',
    });
    if (!upstream.ok || upstream.status >= 300) throw new Error('Proveedor no disponible');
    const html = await upstream.text();
    const exchangeRate = await getExchangeRate();
    const data = product ? parseProduct(html, target, exchangeRate) : parseCatalog(html, exchangeRate);
    if (path === '/catalog' && !data.products.length) throw new Error('Catálogo no disponible');
    return json({ ...data, exchangeRate, source: 'live', updatedAt: new Date().toISOString() });
  } catch {
    return json({ error: 'No se pudo consultar G5. Intenta nuevamente.' }, 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/payments/')) return withSecurity(await payments(request, env, ctx));
    if (url.pathname.startsWith('/api/')) {
      const limited = await rateLimit(request, env, 'api');
      if (limited) return withSecurity(limited);
      return withSecurity(await withBackup(request, () => api(request)));
    }
    return env.ASSETS.fetch(request);
  },
};
