import {rpc} from './rpc.mjs';
import {execSync} from 'node:child_process';
const keccak = hex => execSync(`cast keccak ${hex}`,{maxBuffer:1<<28}).toString().trim();
const A = {
  dnssecImpl:      '0x0fc3152971714E5ed7723FAFa650F86A4BaF30C5',
  dnssecImplLegacy:'0x46c6F79952d3046Bf673a28132ff2a81F306959c',
  registrar:       '0xB32cB5677a7C971689228EC835800432B339bA2B',
  registrarLegacy: '0x58774Bb8acD458A640aF0B88238369A167546ef2',
  p256New:         '0xb091c4f6fac16edda5ee1e0f4738f80011905878',
  p256Old:         '0x0faa24e538bA4620165933f68a9d142f79A68091',
};
const TOPIC='0xf73c3c226af96b7f1ba666a21b3ceaf2be3ee6a365e3178fd9cd1eaae0075aa8';
const B_PRECOMPILE=23935694, P_ENS_CLAIM=24619423;
const report={};

console.log('=== A. AlgorithmUpdated full history (independent eth_getLogs 0x0 -> latest)');
for (const [n,addr] of [['dnssecImpl',A.dnssecImpl],['dnssecImplLegacy',A.dnssecImplLegacy]]) {
  const logs=await rpc('eth_getLogs',[{fromBlock:'0x0',toBlock:'latest',address:addr,topics:[TOPIC]}]);
  const rows=logs.map(l=>({block:parseInt(l.blockNumber,16),txIndex:parseInt(l.transactionIndex,16),
    logIndex:parseInt(l.logIndex,16),tx:l.transactionHash,id:parseInt(l.data.slice(2,66),16),
    algo:'0x'+l.data.slice(90,130)}));
  console.log(`\n${n} ${addr}: ${rows.length} events`);
  for(const r of rows) console.log(`  blk ${r.block} txIdx ${r.txIndex} logIdx ${r.logIndex} alg ${String(r.id).padStart(2)} -> ${r.algo}`);
  report[n+'_algorithmUpdated']=rows;
}

console.log('\n=== B. algorithms(13) probed directly at boundary blocks (selector 0xc327deef)');
const call13 = '0xc327deef'+'0d'.padStart(64,'0');
for (const b of [19020687, 19020688, B_PRECOMPILE-1, B_PRECOMPILE, P_ENS_CLAIM-1, P_ENS_CLAIM, 'latest']) {
  const tag = b==='latest'?'latest':'0x'+b.toString(16);
  const r=await rpc('eth_call',[{to:A.dnssecImpl,data:call13},tag]);
  console.log(`  blk ${String(b).padEnd(9)} algorithms(13) = 0x${r.slice(26)}`);
}

console.log('\n=== C. Deployed runtime bytecode hashes (keccak256) at latest');
for (const [n,addr] of Object.entries(A)) {
  const code=await rpc('eth_getCode',[addr,'latest']);
  const size=(code.length-2)/2;
  console.log(`  ${n.padEnd(17)} ${addr}  size ${String(size).padStart(6)}B  keccak ${size?keccak(code):'(no code)'}`);
  report[n+'_code']={address:addr,size,keccak:size?keccak(code):null};
}

console.log('\n=== D. Verifier bytecode at the OLD verifier, sampled inside its active interval');
for (const b of [19020688, 24619422]) {
  const code=await rpc('eth_getCode',[A.p256Old,'0x'+b.toString(16)]);
  console.log(`  p256Old @${b}: size ${(code.length-2)/2}B keccak ${keccak(code)}`);
}
console.log('\n=== E. The P_ENS rotation transaction — is it one batch?');
const rot=report.dnssecImpl_algorithmUpdated.filter(r=>r.block===P_ENS_CLAIM);
const txs=[...new Set(rot.map(r=>r.tx))];
console.log(`  ${rot.length} AlgorithmUpdated logs at block ${P_ENS_CLAIM} across ${txs.length} tx(s): ${txs.join(', ')}`);
for (const t of txs) {
  const tx=await rpc('eth_getTransactionByHash',[t]);
  const rc=await rpc('eth_getTransactionReceipt',[t]);
  console.log(`  tx ${t}\n    from ${tx.from} to ${tx.to} status ${rc.status} gasUsed ${parseInt(rc.gasUsed,16)}`);
  console.log(`    selector ${tx.input.slice(0,10)} calldataLen ${(tx.input.length-2)/2}B  totalLogs ${rc.logs.length}`);
  const tr=await rpc('debug_traceTransaction',[t,{tracer:'callTracer'}]);
  const walk=(c,d=0)=>{console.log(`      ${'  '.repeat(d)}${c.type} -> ${c.to??''} ${(c.input??'').slice(0,10)}`);(c.calls??[]).forEach(x=>walk(x,d+1));};
  walk(tr);
}
console.log('\n=== F. Contract deployment provenance');
for (const [n,addr] of Object.entries(A)) {
  // find creation via binary search on code presence
  let lo=0, hi=parseInt(await rpc('eth_blockNumber',[]),16);
  if ((await rpc('eth_getCode',[addr,'0x0'])) !== '0x') { console.log(`  ${n}: code at genesis?`); continue; }
  while(hi-lo>1){const m=Math.floor((lo+hi)/2);const c=await rpc('eth_getCode',[addr,'0x'+m.toString(16)]);if(c==='0x')lo=m;else hi=m;}
  const blk=await rpc('eth_getBlockByNumber',['0x'+hi.toString(16),true]);
  const creator=blk.transactions.find(async t=>true);
  console.log(`  ${n.padEnd(17)} created in block ${hi} ts ${new Date(parseInt(blk.timestamp,16)*1000).toISOString()}`);
  report[n+'_creation']={block:hi,timestamp:parseInt(blk.timestamp,16)};
}
import fs from 'node:fs';
fs.writeFileSync('research/derived/step2-provenance.json',JSON.stringify(report,null,2));
console.log('\nwrote research/derived/step2-provenance.json');
