import {getValidatedTrace} from './rpc3.mjs';
import {STATS} from './rpc.mjs';
const R='0xb32cb5677a7c971689228ec835800432b339ba2b';
const TX='0x54dc404968ac4ca18df6c78dee1baeb16c69c9a874a9074bec7ac3f3cdb2c522';
console.log('validated-trace reader, 30 consecutive fetches of a tx known to corrupt ~4%:');
let ok=0, hits=[];
for(let i=0;i<30;i++){
  const {trace}=await getValidatedTrace(TX);
  let n=0; const walk=c=>{if((c.to||'').toLowerCase()===R)n++;(c.calls||[]).forEach(walk);}; walk(trace);
  hits.push(n); ok++;
}
const uniq=[...new Set(hits)];
console.log(`  ${ok}/30 returned a validated trace`);
console.log(`  registrar-hit counts across runs: ${uniq.join(',')}  ${uniq.length===1?'STABLE ✓':'*** UNSTABLE ***'}`);
console.log(`  corrupt traces rejected by invariants: ${STATS.traceRejects||0}`);
