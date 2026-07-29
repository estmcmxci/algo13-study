import {rpc} from './rpc.mjs';
import {readConfirmed} from './rpc2.mjs';
import {execSync} from 'node:child_process';
const keccak=h=>execSync(`cast keccak ${h}`,{maxBuffer:1<<28}).toString().trim();
const V={
 'alg13 OLD (legacy oracle 0x21745ff6, 1324 legacy-registrar claims)':'0xe571a50f76ff7404f3ce380d06cbd2c9c6ca3670',
 'alg13 OLD (current oracle, pre-P_ENS, 428+78 claims)               ':'0x0faa24e538bA4620165933f68a9d142f79A68091',
 'alg13 NEW (current oracle, post-P_ENS, 315 claims)                 ':'0xb091c4f6fac16edda5ee1e0f4738f80011905878',
};
for(const [n,a] of Object.entries(V)){
  const c=(await readConfirmed('eth_getCode',[a,'latest'])).value;
  console.log(`${n}\n   ${a}  size ${String((c.length-2)/2).padStart(5)}B  keccak ${keccak(c)}`);
}
