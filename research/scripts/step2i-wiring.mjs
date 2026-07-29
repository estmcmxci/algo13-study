import {rpc} from './rpc.mjs';
import {readConfirmed} from './rpc2.mjs';
const A={dnssecImpl:'0x0fc3152971714E5ed7723FAFa650F86A4BaF30C5',dnssecImplLegacy:'0x46c6F79952d3046Bf673a28132ff2a81F306959c',
  registrar:'0xB32cB5677a7C971689228EC835800432B339bA2B',registrarLegacy:'0x58774Bb8acD458A640aF0B88238369A167546ef2'};
const head=parseInt(await rpc('eth_blockNumber',[]),16);
console.log('=== Registrar -> oracle wiring (immutable oracle() 0x7dc0d1d0)');
for(const [n,addr] of [['registrar',A.registrar],['registrarLegacy',A.registrarLegacy]]){
  const r=await readConfirmed('eth_call',[{to:addr,data:'0x7dc0d1d0'},'latest']);
  console.log(`  ${n.padEnd(16)} oracle = 0x${r.value.slice(26)}`);
}
console.log('\n=== Legacy oracle algorithms(13) over time  [verifier NOT listed in the work order]');
const c13='0xc327deef'+'0d'.padStart(64,'0');
for(const b of [13040353,13040354,15000000,19020686,24619423,head-1]){
  const r=await readConfirmed('eth_call',[{to:A.dnssecImplLegacy,data:c13},'0x'+b.toString(16)]);
  console.log(`  legacyOracle @${String(b).padEnd(9)} algorithms(13) = 0x${r.value.slice(26)}`);
}
console.log('\n=== Sanity: does legacy oracle still get used? Claim events on legacy registrar since 19,027,588');
const T=['0x87db02a0e483e2818060eddcbb3488ce44e35aff49a70d92c2aa6c8046cf01e2','0xa2e66ce20e6fb2c4f61339c364ad79f15160cf5307230c8bc4d628adbca2ba39'];
for(const [n,addr] of [['registrar',A.registrar],['registrarLegacy',A.registrarLegacy]]){
  for(const t of T){
    const logs=await rpc('eth_getLogs',[{fromBlock:'0x0',toBlock:'latest',address:addr,topics:[t]}]);
    if(logs.length) console.log(`  ${n} topic ${t.slice(0,10)}… : ${logs.length} Claim events  (first blk ${parseInt(logs[0].blockNumber,16)}, last blk ${parseInt(logs.at(-1).blockNumber,16)})`);
    else console.log(`  ${n} topic ${t.slice(0,10)}… : 0`);
  }
}
