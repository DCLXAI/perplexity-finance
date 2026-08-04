import { catalogQuote } from './catalog.js';
export function assetKind(symbol:string):'stock'|'crypto'|'unsupported'{const kind=catalogQuote(symbol)?.kind;return kind==='crypto'?'crypto':kind==='stock'||kind==='etf'?'stock':'unsupported';}
export function toAlpacaSymbol(symbol:string):string{return assetKind(symbol)==='crypto'&&symbol.endsWith('USD')?`${symbol.slice(0,-3)}/USD`:symbol;}
export function fromAlpacaSymbol(symbol:string):string{return symbol.replace('/','');}
export function isAlpacaSupported(symbol:string):boolean{return assetKind(symbol)!=='unsupported';}
