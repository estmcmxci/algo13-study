import {rpc} from './rpc.mjs';
import fs from 'node:fs';
const C={
  registrar_current:'0xB32cB5677a7C971689228EC835800432B339bA2B',
  registrar_legacy:'0x58774Bb8acD458A640aF0B88238369A167546ef2',
  oracle_current:'0x0fc3152971714E5ed7723FAFa650F86A4BaF30C5',
  oracle_legacy:'0x21745ff62108968fbf5ab1e07961cc0fcbeb2364',
  oracle_legacy_original:'0x46c6F79952d3046Bf673a28132ff2a81F306959c',
};
// Known topic0 -> name (derived via cast, not guessed)
const NAMES={
 '0xf73c3c226af96b7f1ba666a21b3ceaf2be3ee6a365e3178fd9cd1eaae0075aa8':'AlgorithmUpdated(uint8,address)',
 '0x55ced933cdd5a34dd03eb5d4bef19ec6ebb251dcd7a988eee0c1b9a13baaa88b':'RRSetUpdated(bytes,bytes)',
 '0x87db02a0e483e2818060eddcbb3488ce44e35aff49a70d92c2aa6c8046cf01e2':'Claim(bytes32,address,bytes,uint32)',
 '0xa2e66ce20e6fb2c4f61339c364ad79f15160cf5307230c8bc4d628adbca2ba39':'Claim(bytes32,address,bytes)',
};
const CENSUS_LO=13083904;
const out={};
for(const [name,addr] of Object.entries(C)){
  const logs=await rpc('eth_getLogs',[{fromBlock:'0x0',toBlock:'latest',address:addr}],{endpoint:'public'});
  const byT={};
  for(const l of logs){ const t=l.topics[0]||'(anonymous)';
    (byT[t] ??= {n:0, blocks:[]}); byT[t].n++; if(byT[t].blocks.length<6) byT[t].blocks.push(parseInt(l.blockNumber,16)); }
  console.log(`\n${name}  ${addr}   ${logs.length} logs total`);
  for(const [t,v] of Object.entries(byT).sort((a,b)=>b[1].n-a[1].n)){
    const inCensus=v.blocks.some(b=>b>=CENSUS_LO);
    console.log(`   ${String(v.n).padStart(5)}  ${NAMES[t]||t}   first blocks ${v.blocks.join(',')}${inCensus?'':'   [all pre-census]'}`);
  }
  out[name]=byT;
}
fs.writeFileSync('research/derived/p3-mutable-audit-events.json',JSON.stringify(out,null,1));
