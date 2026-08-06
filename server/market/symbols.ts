import { catalogQuote } from './catalog.js';
/**
 * Region guard, added for P11: `catalogQuote`'s catalog now spans both US and KR listings
 * (`engine.getAll()` did not change shape here, but its contents did — see catalog.ts), and no
 * external equity/crypto provider integrated in `server/market/providers/*` covers KRX. Region
 * selection never changes provenance rules or the quality gate (see ARCHITECTURE.md), so a
 * non-US-region symbol must be classified `'unsupported'` here, before it ever reaches `kind`.
 * This is the single choke point behind `isAlpacaSupported` and every provider's `supports()`
 * (`AlpacaMarketDataProvider`, `FinnhubQuoteProvider`, `CoinbaseQuoteProvider`) — guarding here
 * means a KR code (e.g. `005930`) is structurally never offered to a US-equity provider, not a
 * matter of what that provider happens to do with a 6-digit numeric symbol it wasn't designed
 * to receive.
 */
export function assetKind(symbol:string):'stock'|'crypto'|'unsupported'{const quote=catalogQuote(symbol);if(!quote||quote.region!=='US')return 'unsupported';const kind=quote.kind;return kind==='crypto'?'crypto':kind==='stock'||kind==='etf'?'stock':'unsupported';}
export function toAlpacaSymbol(symbol:string):string{return assetKind(symbol)==='crypto'&&symbol.endsWith('USD')?`${symbol.slice(0,-3)}/USD`:symbol;}
export function fromAlpacaSymbol(symbol:string):string{return symbol.replace('/','');}
export function isAlpacaSupported(symbol:string):boolean{return assetKind(symbol)!=='unsupported';}
