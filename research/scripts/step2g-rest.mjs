import {rpc} from './rpc.mjs';
import {readConfirmed, creationBlock} from './rpc2.mjs';
const A={dnssecImpl:'0x0fc3152971714E5ed7723FAFa650F86A4BaF30C5',dnssecImplLegacy:'0x46c6F79952d3046Bf673a28132ff2a81F306959c',
  registrar:'0xB32cB5677a7C971689228EC835800432B339bA2B',registrarLegacy:'0x58774Bb8acD458A640aF0B88238369A167546ef2',
  p256New:'0xb091c4f6fac16edda5ee1e0f4738f80011905878',p256Old:'0x0faa24e538bA4620165933f68a9d142f79A68091',
  p256LegacyOracle:'0xe571a50f76ff7404f3ce380d06cbd2c9c6ca3670'};
const head=parseInt(await rpc('eth_blockNumber',[]),16);
for(const n of ['p256New','p256Old','p256LegacyOracle']){
  const b=await creationBlock(A[n],head);
  const blk=await rpc('eth_getBlockByNumber',['0x'+b.toString(16),false]);
  console.log(`  ${n.padEnd(17)} ${A[n]}  block ${String(b).padStart(9)}  ${new Date(parseInt(blk.timestamp,16)*1000).toISOString()}`);
}
console.log('\n=== Registrar -> oracle wiring (immutable oracle() 0x7dc0d1d0)');
for(const [n,addr] of [['registrar',A.registrar],['registrarLegacy',A.registrarLegacy]]){
  const r=await readConfirmed('eth_call',[{to:addr,data:'0x7dc0d1d0'},'latest']);
  console.log(`  ${n.padEnd(16)} oracle = 0x${r.value.slice(26)}`);
}
console.log('\n=== Legacy oracle algorithms(13) over time  [verifier NOT in the work order]');
const c13='0xc327deef'+'0d'.padStart(64,'0');
for(const b of [13040353,13040354,15000000,19020686,24619423,head-1]){
  const r=await readConfirmed('eth_call',[{to:A.dnssecImplLegacy,data:c13},'0x'+b.toString(16)]);
  console.log(`  legacyOracle @${String(b).padEnd(9)} algorithms(13) = 0x${r.value.slice(26)}`);
}
