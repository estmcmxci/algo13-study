import {rpc} from './rpc.mjs';
import fs from 'node:fs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const out={};
const EOA='0x0000000000000000000000000000000000000001';
const INPUT='0xf3c3fc2bc93f926c16c726097de5bcafec49792d10effc432d4d03bc6aef54feab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00';

console.log('=== A1. INTRINSIC GAS 23,536 — I asserted this, never measured it');
const empty=parseInt(await rpc('eth_estimateGas',[{from:EOA,to:'0x000000000000000000000000000000000000dEaD',data:'0x'}],{endpoint:'alchemy'}),16);
await sleep(400);
const withData=parseInt(await rpc('eth_estimateGas',[{from:EOA,to:'0x000000000000000000000000000000000000dEaD',data:INPUT}],{endpoint:'alchemy'}),16);
const bytes=Buffer.from(INPUT.slice(2),'hex');
let z=0,nz=0; for(const b of bytes) b===0?z++:nz++;
const calc=z*4+nz*16;
console.log(`  empty-calldata tx to codeless address : ${empty}   [expect 21000]`);
console.log(`  160-byte calldata to same address     : ${withData}`);
console.log(`  measured calldata component           : ${withData-empty}`);
console.log(`  my arithmetic (${z} zero x4 + ${nz} nonzero x16) : ${calc}`);
console.log(`  my asserted intrinsic 23,536 vs measured ${empty+calc}  => ${empty+calc===23536?'CONFIRMED':'*** WRONG ***'}`);
out.intrinsic={measured:empty+ (withData-empty), asserted:23536, base:empty, calldata:withData-empty, arithmetic:calc};

console.log('\n=== A2. BLOCK TIMESTAMPS — single-sourced from Alchemy. Cross-check vs public endpoint');
const ts=JSON.parse(fs.readFileSync('research/derived/p3-block-timestamps.json','utf8'));
const keys=Object.keys(ts); const pick=[keys[0],keys[Math.floor(keys.length/4)],keys[Math.floor(keys.length/2)],keys[Math.floor(3*keys.length/4)],keys[keys.length-1]];
let tsMismatch=0;
for(const k of pick){ await sleep(300);
  const b=await rpc('eth_getBlockByNumber',['0x'+Number(k).toString(16),false],{endpoint:'public'});
  const ok=b && parseInt(b.timestamp,16)===ts[k].timestamp && b.hash===ts[k].hash;
  if(!ok) tsMismatch++;
  console.log(`  block ${k}: alchemy ts ${ts[k].timestamp} / public ${b?parseInt(b.timestamp,16):'null'}  hash match ${b?b.hash===ts[k].hash:'n/a'}  ${ok?'OK':'MISMATCH'}`);
}
out.timestamps={sampled:pick.length,mismatches:tsMismatch};

console.log('\n=== A3. effectiveGasPrice — single-sourced from Alchemy receipts. Cross-check vs public');
const rows=fs.readFileSync('research/derived/p1-census.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(r=>!r.failed);
const sample=[rows[0],rows[Math.floor(rows.length/3)],rows[Math.floor(2*rows.length/3)],rows[rows.length-1]];
let gpMismatch=0;
for(const r of sample){ await sleep(300);
  let rc=null; for(let i=0;i<8&&!rc;i++){ rc=await rpc('eth_getTransactionReceipt',[r.tx],{endpoint:'public'}); if(!rc) await sleep(250); }
  const pub=rc?BigInt(rc.effectiveGasPrice).toString():null;
  const ok=pub===r.effectiveGasPrice && (rc?parseInt(rc.gasUsed,16)===r.txGasUsed:false);
  if(!ok) gpMismatch++;
  console.log(`  ${r.tx.slice(0,14)}  alchemy gp ${r.effectiveGasPrice} / public ${pub}  gasUsed match ${rc?parseInt(rc.gasUsed,16)===r.txGasUsed:'n/a'}  ${ok?'OK':'MISMATCH'}`);
}
out.effectiveGasPrice={sampled:sample.length,mismatches:gpMismatch};
fs.writeFileSync('research/derived/p3-assumption-audit.json',JSON.stringify(out,null,1));
