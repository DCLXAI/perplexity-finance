/* ============================================================
   Deterministic seeded RNG + series generators.
   Everything visual is derived from these so the app renders
   identical realistic data on every load (then applies crypto-only mock ticks).
   ============================================================ */

/** mulberry32 — fast deterministic PRNG */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** string → 32-bit seed */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rngFor(key: string): () => number {
  return mulberry32(hashSeed(key));
}

/** Box-Muller gaussian from a uniform rng */
export function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Random-walk price path that starts at `start` and ends exactly at `end`
 * (Brownian bridge), so sparklines agree with the quoted day change.
 */
export function bridgePath(
  key: string,
  start: number,
  end: number,
  points: number,
  volatility = 0.004,
): number[] {
  const rng = rngFor(key);
  const out = new Array<number>(points);
  let v = start;
  const raw = new Array<number>(points);
  raw[0] = start;
  for (let i = 1; i < points; i++) {
    v += v * volatility * gaussian(rng);
    raw[i] = v;
  }
  // shift the walk linearly so the last point lands on `end`
  const drift = end - raw[points - 1];
  for (let i = 0; i < points; i++) {
    out[i] = raw[i] + (drift * i) / (points - 1);
  }
  return out;
}

/**
 * OHLCV history ending at `endPrice` on explicit timestamps.
 * The caller owns calendar/session semantics; this generator only
 * creates deterministic, internally consistent bars.
 */
export function historyAtTimes(
  key: string,
  endPrice: number,
  times: number[],
  annualDrift = 0.18,
  annualVol = 0.34,
  periodsPerYear = 252,
  volumeScale = 8e6,
): { time: number; open: number; high: number; low: number; close: number; volume: number }[] {
  if (times.length === 0) return [];
  const rng = rngFor(key + ':hist');
  const dt = 1 / periodsPerYear;
  const mu = annualDrift;
  const sigma = annualVol;

  // Walk backwards so the final close lands exactly on the snapshot quote.
  const closes = new Array<number>(times.length);
  closes[times.length - 1] = endPrice;
  for (let i = times.length - 2; i >= 0; i--) {
    const z = gaussian(rng);
    const ret = (mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z;
    closes[i] = closes[i + 1] / Math.exp(ret);
  }

  return times.map((time, i) => {
    const close = closes[i];
    const prior = i === 0 ? close : closes[i - 1];
    const open = prior * (1 + 0.0018 * gaussian(rng));
    const high = Math.max(open, close) * (1 + Math.abs(0.006 * gaussian(rng)));
    const low = Math.min(open, close) * (1 - Math.abs(0.006 * gaussian(rng)));
    const volume = Math.max(
      1,
      Math.round(volumeScale * (0.55 + rng()) * (1 + Math.abs(gaussian(rng)) * 0.35)),
    );
    return { time, open, high, low, close, volume };
  });
}
