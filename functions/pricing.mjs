import fallback from './exchange-rate.json' with { type: 'json' };
export const markup = value => Math.round(Number(value) * 130) / 100;
export const priceCLP = (value, rate = fallback.rate) => Math.round(Number(value) * 1.30 * rate);
export const defaultExchangeRate = fallback;
const bankRateUrl = 'https://api.frankfurter.dev/v2/rate/USD/CLP?providers=BCCH';
const maxAge = 7 * 24 * 60 * 60 * 1000;
let cached = null;
let pending = null;

function isCurrentRate(rate, date, now) {
  const timestamp = Date.parse(date);
  return Number.isFinite(rate) && rate > 100 && rate < 10000
    && timestamp <= now && now - timestamp <= maxAge;
}

async function fetchRate(source, timeout, parse) {
  const response = await fetch(source, { signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw Error('Exchange unavailable');
  const now = Date.now();
  const rate = parse(await response.json(), now);
  if (!rate || !isCurrentRate(rate.rate, rate.date, now)) throw Error('Invalid exchange rate');
  return { ...rate, date: rate.date.slice(0, 10), source, fetchedAt: now, fallback: false };
}

export async function getExchangeRate() {
  if (cached && Date.now() - cached.fetchedAt < (cached.fallback ? 30000 : 6 * 60 * 60 * 1000)) return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
      cached = await fetchRate(fallback.source, 2500, (body, now) =>
        body.serie?.filter(entry => isCurrentRate(entry.valor, entry.fecha, now))
          .sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha))
          .map(entry => ({ rate: entry.valor, date: entry.fecha }))[0]);
    } catch {
      try {
        cached = await fetchRate(bankRateUrl, 4000, body =>
          body.base === 'USD' && body.quote === 'CLP' ? { rate: body.rate, date: body.date } : null);
      } catch {
        cached = { ...(cached || fallback), fetchedAt: Date.now(), fallback: true };
      }
    }
    return cached;
  })();
  try { return await pending; } finally { pending = null; }
}
