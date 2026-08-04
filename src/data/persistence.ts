/* ============================================================
   Runtime validation helpers for browser persistence.
   LocalStorage is untrusted input: old schemas, manual edits and
   partially-written values must never crash the application.
   ============================================================ */

export type ThemeName = 'light' | 'dark';

export function parseJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export function sanitizeWatchlist(
  value: unknown,
  allowedSymbols: ReadonlySet<string>,
  fallback: readonly string[],
  maxItems = 100,
): readonly string[] {
  if (value === null) return Object.freeze([...fallback]);
  if (!Array.isArray(value)) return Object.freeze([...fallback]);

  const seen = new Set<string>();
  const sanitized: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const symbol = item.trim();
    if (!symbol || !allowedSymbols.has(symbol) || seen.has(symbol)) continue;
    seen.add(symbol);
    sanitized.push(symbol);
    if (sanitized.length >= maxItems) break;
  }

  // An intentionally empty array is valid. A non-empty but wholly invalid
  // payload is treated as corruption and falls back to known-good defaults.
  if (value.length > 0 && sanitized.length === 0) return Object.freeze([...fallback]);
  return Object.freeze(sanitized);
}

export function parseTheme(value: unknown, fallback: ThemeName = 'light'): ThemeName {
  return value === 'light' || value === 'dark' ? value : fallback;
}
