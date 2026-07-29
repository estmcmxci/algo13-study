import {rpc} from './rpc.mjs';
const R_CUR='0xb32cb5677a7c971689228ec835800432b339ba2b';
const hx=n=>'0x'+n.toString(16);
const r=await rpc('trace_filter',[{fromBlock:hx(19027588),toBlock:hx(19127588),toAddress:[R_CUR]}]);
console.log(`${r.length} traces`);
const bySel={}, byType={}, txs=new Set(); let errs=0;
for(const t of r){
  byType[t.type]=(byType[t.type]||0)+1;
  txs.add(t.transactionHash);
  if(t.error) errs++;
  const inp=t.action?.input;
  if(inp) { const s=inp.slice(0,10); bySel[s]=(bySel[s]||0)+1; }
}
console.log('  trace types:', byType);
console.log('  distinct txs:', txs.size);
console.log('  traces with error:', errs);
console.log('  top selectors:', Object.entries(bySel).sort((a,b)=>b[1]-a[1]).slice(0,8));
// how many DISTINCT blocks
const blocks=new Set(r.map(t=>t.blockNumber));
console.log('  distinct blocks:', blocks.size);
// duplicates?
const keys=r.map(t=>`${t.transactionHash}:${(t.traceAddress||[]).join('.')}`);
console.log('  distinct (tx,traceAddress) keys:', new Set(keys).size, 'vs', keys.length, 'rows');
