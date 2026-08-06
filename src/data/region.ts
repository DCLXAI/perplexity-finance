/* ============================================================
   Which market a page lists.

   The URL is the single source of truth at render time — links and
   refreshes have to work. localStorage only picks the landing default and
   is never consulted during render, so the two cannot disagree.
   ============================================================ */

export type MarketRegion = 'US' | 'KR';

export const REGIONS: readonly MarketRegion[] = Object.freeze(['US', 'KR']);
export const DEFAULT_REGION: MarketRegion = 'US';

/** Search-parameter name carrying the region. */
export const REGION_PARAM = 'region';

const STORAGE_KEY = 'pf.region';

export const REGION_LABELS: Readonly<Record<MarketRegion, { label: string; flag: string }>> =
  Object.freeze({
    US: Object.freeze({ label: '미국 시장', flag: '🇺🇸' }),
    KR: Object.freeze({ label: '한국 시장', flag: '🇰🇷' }),
  });

/**
 * Adjective form ("미국"/"한국") derived from the canonical label, for copy like
 * "○○ 주식 표본 히트맵". Lives here rather than beside any one consumer: the document title in
 * the always-loaded shell needs it too, and importing it from a lazily-loaded feature module
 * would pull that chunk into the shell bundle.
 */
export function regionAdj(region: MarketRegion): string {
  return REGION_LABELS[region].label.replace(' 시장', '');
}

/** Never throws: an unrecognised value is a stale link, not an error worth breaking a page over. */
export function parseRegion(value: string | null | undefined): MarketRegion {
  const upper = (value ?? '').toUpperCase();
  return REGIONS.includes(upper as MarketRegion) ? (upper as MarketRegion) : DEFAULT_REGION;
}

export function regionFromSearch(params: URLSearchParams): MarketRegion {
  return parseRegion(params.get(REGION_PARAM));
}

export function rememberRegion(region: MarketRegion): void {
  try {
    localStorage.setItem(STORAGE_KEY, region);
  } catch {
    // Private mode or a full quota: the landing default is a convenience, not state worth failing on.
  }
}

export function landingRegion(): MarketRegion {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    return DEFAULT_REGION;
  }
  return parseRegion(stored);
}
