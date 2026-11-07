import fallback from './exchange-rate.json' with { type: 'json' };
export const markup = value => Math.round(Number(value) * 130) / 100;
export const priceCLP = (value, rate = fallback.rate) => Math.round(Number(value) * 1.30 * rate);
export const defaultExchangeRate = fallback;
let cached = null;
let pending = null;
export async function getExchangeRate() {
  if (cached && Date.now() - cached.fetchedAt < 6 * 60 * 60 * 1000) return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
      const r = await fetch(fallback.source, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw Error('Exchange unavailable');
      const body = await r.json();
      const entries = body.serie?.filter(x => Number.isFinite(x.valor) && x.valor > 100 && x.valor < 10000 && Number.isFinite(Date.parse(x.fecha)) && Date.parse(x.fecha) <= Date.now());
      const latest = entries?.sort((a,b) => Date.parse(b.fecha)-Date.parse(a.fecha))[0];
      if (!latest) throw Error('Invalid exchange rate');
      cached = { rate: latest.valor, date: latest.fecha.slice(0,10), source: fallback.source, fetchedAt: Date.now(), fallback: false };
    } catch {
      cached = { ...(cached || fallback), fetchedAt: Date.now(), fallback: true };
    }
    return cached;
  })();
  try { return await pending; } finally { pending = null; }
}
