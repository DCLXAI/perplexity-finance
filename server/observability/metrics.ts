type Labels=Readonly<Record<string,string|number>>;
function key(name:string,labels:Labels={}):string { const suffix=Object.entries(labels).sort().map(([k,v])=>`${k}=${v}`).join(','); return suffix?`${name}{${suffix}}`:name; }
class Metrics {
  private counters=new Map<string,number>(); private timings=new Map<string,{count:number;sum:number;max:number}>();
  increment(name:string,labels:Labels={},value=1):void { const k=key(name,labels); this.counters.set(k,(this.counters.get(k)??0)+value); }
  observeMs(name:string,value:number,labels:Labels={}):void { const k=key(name,labels); const prev=this.timings.get(k)??{count:0,sum:0,max:0}; this.timings.set(k,{count:prev.count+1,sum:prev.sum+value,max:Math.max(prev.max,value)}); }
  snapshot():unknown { return {generatedAt:new Date().toISOString(),counters:Object.fromEntries(this.counters),timings:Object.fromEntries([...this.timings].map(([k,v])=>[k,{...v,avg:v.count?v.sum/v.count:0}]))}; }
}
export const metrics=new Metrics();
export async function timed<T>(name:string,fn:()=>Promise<T>,labels:Labels={}):Promise<T>{const start=performance.now();try{return await fn();}finally{metrics.observeMs(name,performance.now()-start,labels);}}
