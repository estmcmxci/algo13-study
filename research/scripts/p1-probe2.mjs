import {rpc} from './rpc.mjs';
const R_CUR='0xb32cb5677a7c971689228ec835800432b339ba2b';
const hx=n=>'0x'+n.toString(16);
// 1. Does trace_filter honour toAddress at all?
const r=await rpc('trace_filter',[{fromBlock:hx(19027588),toBlock:hx(19127588),toAddress:[R_CUR]}]);
console.log(`span 19,027,588..19,127,588 -> ${r.length} traces`);
const tos=new Set(r.map(t=>t.action?.to).filter(Boolean));
console.log('  distinct `to` addresses in result:', [...tos].slice(0,6), tos.size>6?`(+${tos.size-6})`:'');
console.log('  all == registrar?', [...tos].every(t=>t.toLowerCase()===R_CUR));
console.log('  block range actually returned:', Math.min(...r.map(t=>t.blockNumber)), '..', Math.max(...r.map(t=>t.blockNumber)));
console.log('  sample trace:', JSON.stringify(r[0]).slice(0,220));
