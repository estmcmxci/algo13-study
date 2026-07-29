import {getValidatedTrace} from './rpc3.mjs';
import {STATS} from './rpc.mjs';
const R='0xb32cb5677a7c971689228ec835800432b339ba2b';
const TX='0x54dc404968ac4ca18df6c78dee1baeb16c69c9a874a9074bec7ac3f3cdb2c522';
const hits=[];
for(let i=0;i<20;i++){
  const {trace}=await getValidatedTrace(TX);
  let n=0; const walk=c=>{if((c.to||'').toLowerCase()===R)n++;(c.calls||[]).forEach(walk)}; walk(trace);
  hits.push(n);
}
console.log('cross-source validated trace x20 -> hit counts:', [...new Set(hits)].join(','), new Set(hits).size===1?'STABLE':'UNSTABLE');
console.log('alchemy:', JSON.stringify(STATS.alchemy));
console.log('public :', JSON.stringify(STATS.public));
