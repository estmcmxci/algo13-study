import {rpc, STATS} from './rpc.mjs';
import fs from 'node:fs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CENSUS_LO=13083904, HEAD=25627360;
const A={
  registrar_current:'0xB32cB5677a7C971689228EC835800432B339bA2B',
  registrar_legacy :'0x58774Bb8acD458A640aF0B88238369A167546ef2',
  oracle_current   :'0x0fc3152971714E5ed7723FAFa650F86A4BaF30C5',
  oracle_legacy    :'0x21745ff62108968fbf5ab1e07961cc0fcbeb2364',
  oracle_legacy_orig:'0x46c6F79952d3046Bf673a28132ff2a81F306959c',
};
const SEL={ oracle:'0x7dc0d1d0', owner:'0x8da5cb5b', anchors:'0x2ea01c33',
  alg:id=>'0xc327deef'+id.toString(16).padStart(64,'0'),
  dig:id=>'0x8f5cc2b8'+id.toString(16).padStart(64,'0') };
// deployment blocks, below which a probe is meaningless
const BORN={registrar_current:19027588,registrar_legacy:13040372,oracle_current:19020686,
            oracle_legacy:13097282,oracle_legacy_orig:13040286};
async function callAt(addr,data,b){
  await sleep(120);
  try{ return await rpc('eth_call',[{to:addr,data},'0x'+b.toString(16)],{endpoint:'alchemy',retries:4}); }
  catch(e){ return 'ERR:'+String(e.message).slice(0,40); }
}
// grid across the census range; include every known event block as a probe point
const EVENTS=[13040354,13040372,13097282,13097289,13097301,13097305,13097311,13097319,13103261,
              19020686,19020688,19027588,23935694,24619423,24967723];
function grid(lo,hi,n=14){const out=[];for(let i=0;i<=n;i++)out.push(Math.round(lo+(hi-lo)*i/n));return out;}
const results=[];
async function audit(label, addr, data, lo){
  const pts=[...new Set([...grid(Math.max(lo,CENSUS_LO),HEAD), ...EVENTS.filter(b=>b>=lo&&b<=HEAD),
                         ...EVENTS.map(b=>b-1).filter(b=>b>=lo&&b<=HEAD)])].sort((a,b)=>a-b);
  const vals=new Map();
  for(const b of pts){ const v=await callAt(addr,data,b); if(!vals.has(v)) vals.set(v,[]); vals.get(v).push(b); }
  const distinct=[...vals.keys()].filter(v=>!v.startsWith('ERR'));
  const changed=distinct.length>1;
  results.push({getter:label, distinctValues:distinct.length, changed,
    values:[...vals.entries()].map(([v,bs])=>({value:v.length>66?v.slice(0,66)+'…':v, firstSeen:bs[0], lastSeen:bs[bs.length-1], nProbes:bs.length}))});
  console.log(`${changed?'CHANGED ':'constant'}  ${label.padEnd(34)} distinct=${distinct.length}  probes=${pts.length}`);
  if(changed) for(const [v,bs] of vals) console.log(`      ${v.slice(0,50)}…  blocks ${bs[0]}..${bs[bs.length-1]} (${bs.length})`);
}
console.log('MUTABLE-STATE AUDIT — value probes over census range 13,083,904 .. 25,627,360\n');
await audit('registrar_current.oracle()',A.registrar_current,SEL.oracle,BORN.registrar_current);
await audit('registrar_legacy.oracle()', A.registrar_legacy, SEL.oracle, BORN.registrar_legacy);
for(const [n,a] of [['oracle_current',A.oracle_current],['oracle_legacy',A.oracle_legacy],['oracle_legacy_orig',A.oracle_legacy_orig]]){
  await audit(`${n}.owner()`, a, SEL.owner, BORN[n==='oracle_legacy_orig'?'oracle_legacy_orig':n]);
  for(const id of [5,7,8,13]) await audit(`${n}.algorithms(${id})`, a, SEL.alg(id), BORN[n==='oracle_legacy_orig'?'oracle_legacy_orig':n]);
}
await audit('oracle_current.anchors()',A.oracle_current,SEL.anchors,BORN.oracle_current);
fs.writeFileSync('research/derived/p3-mutable-audit.json',JSON.stringify(results,null,1));
console.log(`\nalchemy 429s during audit: ${STATS.alchemy.rateLimited}`);
console.log(`getters audited: ${results.length}   CHANGED: ${results.filter(r=>r.changed).length}`);
