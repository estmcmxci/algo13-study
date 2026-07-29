import {rpc} from './rpc.mjs';
const R_CUR='0xb32cb5677a7c971689228ec835800432b339ba2b';
const R_LEG='0x58774bb8acd458a640af0b88238369a167546ef2';
const hx=n=>'0x'+n.toString(16);
async function tf(from,to,addr){
  const t0=Date.now();
  const r=await rpc('trace_filter',[{fromBlock:hx(from),toBlock:hx(to),toAddress:[addr]}]);
  return {n:r.length, ms:Date.now()-t0};
}
console.log('probing trace_filter chunk scaling (toAddress = current registrar)');
for(const span of [10_000, 100_000, 500_000, 1_000_000]){
  try{ const {n,ms}=await tf(19027588, 19027588+span, R_CUR);
       console.log(`  span ${String(span).padStart(9)} blocks -> ${String(n).padStart(5)} traces  ${ms}ms`); }
  catch(e){ console.log(`  span ${String(span).padStart(9)} blocks -> ERROR ${e.message.slice(0,110)}`); }
}
console.log('\nprobing a very large span (full current-registrar life):');
try{ const {n,ms}=await tf(19027588, 25627230, R_CUR); console.log(`  full -> ${n} traces ${ms}ms`); }
catch(e){ console.log(`  full -> ERROR ${e.message.slice(0,160)}`); }
