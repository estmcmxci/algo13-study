import {rpc} from './rpc.mjs';
const R_CUR='0xb32cb5677a7c971689228ec835800432b339ba2b';
const hx=n=>'0x'+n.toString(16);
const r=await rpc('trace_filter',[{fromBlock:hx(19027588),toBlock:hx(19127588),toAddress:[R_CUR]}]);
const sample=r.filter(t=>t.type==='call').slice(0,3);
for(const t of sample){
  console.log(`\ntrace: blk ${t.blockNumber} tx ${t.transactionHash} traceAddr [${(t.traceAddress||[]).join(',')}]`);
  console.log(`  action.to ${t.action.to}  input ${t.action.input.slice(0,10)}`);
  const tx=await rpc('eth_getTransactionByHash',[t.transactionHash]);
  if(!tx){console.log('  *** TX DOES NOT EXIST ***');continue;}
  console.log(`  REAL tx: block ${parseInt(tx.blockNumber,16)} to ${tx.to} selector ${tx.input.slice(0,10)}`);
  console.log(`  block matches trace? ${parseInt(tx.blockNumber,16)===t.blockNumber}`);
  const tr=await rpc('debug_traceTransaction',[t.transactionHash,{tracer:'callTracer'}]);
  const hits=[]; const walk=(c,p=[])=>{if((c.to||'').toLowerCase()===R_CUR)hits.push({path:p.join('.'),sel:(c.input||'').slice(0,10)});(c.calls||[]).forEach((x,i)=>walk(x,[...p,i]));};
  walk(tr);
  console.log(`  callTracer hits on registrar: ${hits.length}`, JSON.stringify(hits).slice(0,160));
}
