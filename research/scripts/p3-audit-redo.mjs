import {rpc, STATS} from './rpc.mjs';
import fs from 'node:fs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const REG_CUR='0xB32cB5677a7C971689228EC835800432B339bA2B';
const ORC_CUR='0x0fc3152971714E5ed7723FAFa650F86A4BaF30C5';
async function probe(addr,data,blocks,label){
  const vals=new Map(); let errs=0;
  for(const b of blocks){
    await sleep(450);
    let v;
    try{ v=await rpc('eth_call',[{to:addr,data},'0x'+b.toString(16)],{endpoint:'alchemy',retries:5}); }
    catch(e){ errs++; continue; }
    if(!vals.has(v))vals.set(v,[]); vals.get(v).push(b);
  }
  console.log(`${label}\n   distinct=${vals.size}  errored=${errs}  probes=${blocks.length}`);
  for(const [v,bs] of vals) console.log(`   ${v.slice(0,58)}${v.length>58?'…':''}  blocks ${bs[0]}..${bs[bs.length-1]} (${bs.length})`);
  return {label, distinct:vals.size, errs, values:[...vals.entries()].map(([v,bs])=>({v:v.slice(0,66),first:bs[0],last:bs[bs.length-1],n:bs.length}))};
}
const B=[19027588,19466072,20000000,21000000,22000000,23000000,23935693,23935694,24248553,
         24619422,24619423,24967723,25000000,25622490,25627360];
const out=[];
out.push(await probe(REG_CUR,'0x7dc0d1d0',B,'registrar_current.oracle()  [declared `immutable` in source]'));
const B2=[19020686,19020688,19027588,20000000,22000000,23935694,24619423,24967723,25627360];
out.push(await probe(ORC_CUR,'0x98d35f20',B2,'oracle_current.anchors()  [correct selector 0x98d35f20]'));
fs.writeFileSync('research/derived/p3-mutable-audit-redo.json',JSON.stringify(out,null,1));
console.log('\nalchemy 429s during redo:',STATS.alchemy.rateLimited);
