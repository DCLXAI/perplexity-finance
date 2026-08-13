import { cached } from '../cache.js';
import { loadConfig } from '../config.js';
import { logger } from '../observability/logger.js';
import { EARNINGS, GENERAL_NEWS, PREDICTIONS } from '../../src/data/content.js';
import type { EarningsResponse, LiveEarningsEntry, LiveNewsItem, LivePredictionMarket, NewsResponse, PredictionsResponse, ProviderStatus } from '../../src/shared/api.js';
import { fetchAlpacaNews, alpacaNewsStatus } from '../market/alpaca-news.js';
import { alphaStatus, fetchAlphaEarnings } from '../market/providers/alpha-vantage.js';
import { fetchKalshi, fetchPolymarket, predictionStatus } from '../market/providers/predictions.js';

const STATIC_CONTENT_AS_OF_ISO = '2026-08-13T18:49:20Z';

function fallbackPredictions(limit:number):readonly LivePredictionMarket[]{
  return Object.freeze(PREDICTIONS.slice(0,limit).map((m)=>Object.freeze({
    id:`fallback:${m.id}`, question:m.questionKo||m.question,
    outcomes:Object.freeze(m.outcomes.map((o)=>Object.freeze({label:o.label,probability:o.prob,priceDeltaPct:o.deltaPct}))),
    volumeUsd:m.volumeUsd, closesAt:m.endsAt,
    provider:m.source==='Polymarket-style'?'polymarket':'kalshi', providerTimestamp:STATIC_CONTENT_AS_OF_ISO
  })));
}
export async function getPredictions(limit:number,requestId:string):Promise<PredictionsResponse>{
  const safe=Math.max(1,Math.min(30,limit)); const c=loadConfig();
  const hit=await cached(`content:predictions:v3:${safe}`,c.contentCacheSeconds,async()=>{
    const [p,k]=await Promise.allSettled([fetchPolymarket(Math.ceil(safe/2)),fetchKalshi(Math.floor(safe/2))]);
    const markets:LivePredictionMarket[]=[]; const providers:ProviderStatus[]=[];
    if(p.status==='fulfilled'){markets.push(...p.value.markets);providers.push(predictionStatus('polymarket','up',`${p.value.markets.length}개 수신`,p.value.latencyMs));}
    else{const m=p.reason instanceof Error?p.reason.message:String(p.reason);providers.push(predictionStatus('polymarket','down',m));logger.warn('content.polymarket.failed',{message:m});}
    if(k.status==='fulfilled'){markets.push(...k.value.markets);providers.push(predictionStatus('kalshi','up',`${k.value.markets.length}개 수신`,k.value.latencyMs));}
    else{const m=k.reason instanceof Error?k.reason.message:String(k.reason);providers.push(predictionStatus('kalshi','down',m));logger.warn('content.kalshi.failed',{message:m});}
    return {markets:markets.length?Object.freeze(markets.slice(0,safe)):fallbackPredictions(safe),providers:Object.freeze(providers),fallback:markets.length===0};
  });
  return Object.freeze({requestId,generatedAt:new Date().toISOString(),...hit.value});
}
function fallbackEarnings():readonly LiveEarningsEntry[]{return Object.freeze(EARNINGS.map((e)=>Object.freeze({symbol:e.symbol,name:e.company,reportDate:e.dateISO,estimate:e.epsEst,currency:'USD',providerTimestamp:STATIC_CONTENT_AS_OF_ISO})));}
export async function getEarnings(requestId:string):Promise<EarningsResponse>{
  const c=loadConfig();
  if(!c.alphaVantageApiKey)return Object.freeze({requestId,generatedAt:new Date().toISOString(),entries:fallbackEarnings(),provider:alphaStatus('disabled','API 키 미설정'),fallback:true});
  try{const hit=await cached('content:earnings:v3:3month',c.contentCacheSeconds,()=>fetchAlphaEarnings());return Object.freeze({requestId,generatedAt:new Date().toISOString(),entries:hit.value.entries,provider:alphaStatus('up',`${hit.value.entries.length}개 수신`,hit.value.latencyMs),fallback:false});}
  catch(error){const m=error instanceof Error?error.message:String(error);logger.warn('content.earnings.failed',{message:m});return Object.freeze({requestId,generatedAt:new Date().toISOString(),entries:fallbackEarnings(),provider:alphaStatus('down',m),fallback:true});}
}
function fallbackNews():readonly LiveNewsItem[]{return Object.freeze(GENERAL_NEWS.map((n)=>Object.freeze({id:`fallback:${n.id}`,title:n.title,summary:n.summary,source:n.source,url:n.url??'',publishedAt:n.publishedAt??STATIC_CONTENT_AS_OF_ISO,symbols:Object.freeze([...n.symbols])})));}
export async function getNews(symbol:string|undefined,limit:number,requestId:string):Promise<NewsResponse>{
  const c=loadConfig(); const configured=Boolean(c.alpacaKeyId&&c.alpacaSecretKey);
  if(!configured)return Object.freeze({requestId,generatedAt:new Date().toISOString(),items:fallbackNews().slice(0,limit),provider:alpacaNewsStatus(false,'disabled','Alpaca 자격증명 미설정'),fallback:true});
  try{const hit=await cached(`content:news:v3:${symbol??'all'}:${limit}`,c.contentCacheSeconds,()=>fetchAlpacaNews(symbol,limit));return Object.freeze({requestId,generatedAt:new Date().toISOString(),items:hit.value.items,provider:alpacaNewsStatus(true,'up',`${hit.value.items.length}개 수신`,hit.value.latencyMs),fallback:false});}
  catch(error){const m=error instanceof Error?error.message:String(error);logger.warn('content.news.failed',{message:m});return Object.freeze({requestId,generatedAt:new Date().toISOString(),items:fallbackNews().filter((n)=>!symbol||n.symbols.includes(symbol)).slice(0,limit),provider:alpacaNewsStatus(true,'down',m),fallback:true});}
}
