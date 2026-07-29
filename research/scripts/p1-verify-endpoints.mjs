import {ENDPOINTS, redact} from './endpoints.mjs';
async function call(ep, method, params){
  const r = await fetch(ep.url, {method:'POST', headers:{'Content-Type':'application/json','User-Agent':'curl/8.7.1'},
    body: JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  const j = await r.json().catch(()=>({error:{message:'non-JSON'}}));
  return {status:r.status, j};
}
console.log('=== redaction guard self-test');
console.log('  ', redact(`url is ${ENDPOINTS.alchemy.url} end`));
console.log('=== alchemy capability probe');
for (const [m,p] of [['eth_chainId',[]],['eth_blockNumber',[]],
                     ['eth_getBalance',['0x0000000000000000000000000000000000000000','0xf4240']],
                     ['debug_traceTransaction',['0x54dc404968ac4ca18df6c78dee1baeb16c69c9a874a9074bec7ac3f3cdb2c522',{tracer:'callTracer'}]],
                     ['trace_transaction',['0x54dc404968ac4ca18df6c78dee1baeb16c69c9a874a9074bec7ac3f3cdb2c522']]]) {
  const {status,j} = await call(ENDPOINTS.alchemy, m, p);
  const ok = j.result!==undefined;
  console.log(`  ${m.padEnd(26)} http ${status} ${ok?'OK':'ERR '+redact(JSON.stringify(j.error||{})).slice(0,90)}`);
}
