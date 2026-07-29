import {rpc} from './rpc.mjs';
import {readConfirmed} from './rpc2.mjs';
const REAL_LEGACY='0x21745ff62108968fbf5ab1e07961cc0fcbeb2364';
const CLAIMED_LEGACY='0x46c6F79952d3046Bf673a28132ff2a81F306959c';
const TOPIC='0xf73c3c226af96b7f1ba666a21b3ceaf2be3ee6a365e3178fd9cd1eaae0075aa8';
const c13='0xc327deef'+'0d'.padStart(64,'0');
console.log('=== What is 0x21745ff6… (the oracle the LEGACY registrar actually points at)?');
const code=await readConfirmed('eth_getCode',[REAL_LEGACY,'latest']);
console.log('  code size', (code.value.length-2)/2, 'bytes');
const logs=await rpc('eth_getLogs',[{fromBlock:'0x0',toBlock:'latest',address:REAL_LEGACY,topics:[TOPIC]}]);
console.log(`  AlgorithmUpdated events: ${logs.length}`);
for(const l of logs) console.log(`    blk ${parseInt(l.blockNumber,16)} alg ${parseInt(l.data.slice(2,66),16)} -> 0x${l.data.slice(90,130)}`);
for(const b of [13040300,13040400,15000000,19093081,25627000]){
  const r=await readConfirmed('eth_call',[{to:REAL_LEGACY,data:c13},'0x'+b.toString(16)]);
  console.log(`  @${String(b).padEnd(9)} algorithms(13) = 0x${r.value.slice(26)}`);
}
console.log('\n=== And 0x46c6F7… (the address the WORK ORDER calls "Legacy DNSSECImpl"): who calls it?');
const c2=await readConfirmed('eth_getCode',[CLAIMED_LEGACY,'latest']);
console.log('  code size', (c2.value.length-2)/2, 'bytes');
