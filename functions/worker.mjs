import { getExchangeRate } from './pricing.mjs';
import { parseCatalog, parseProduct } from './catalog.mjs';
import { payments } from './payments.mjs';
import { getBestsellers } from './bestsellers.mjs';
import { getCollection,productImage } from './collections.mjs';

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
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/payments/')) return payments(request, env);
    if (url.pathname.startsWith('/api/')) return api(request);
    return env.ASSETS.fetch(request);
  },
};
