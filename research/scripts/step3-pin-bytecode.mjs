import {rpc} from './rpc.mjs';
import {readConfirmed} from './rpc2.mjs';
import {execSync} from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
const keccak = h => execSync(`cast keccak ${h}`,{maxBuffer:1<<28}).toString().trim();
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

// Every artifact whose bytecode is installed or relied on during paired replay.
const ARTIFACTS = [
  {role:'alg13_verifier_old_legacy_oracle', address:'0xe571a50f76ff7404f3ce380d06cbd2c9c6ca3670',
   appliesTo:'period 1, legacy registrar 0x58774Bb8 via oracle 0x21745ff6 (1324 claims)'},
  {role:'alg13_verifier_old_current_oracle', address:'0x0faa24e538bA4620165933f68a9d142f79A68091',
   appliesTo:'period 1 current-registrar (428) + period 2 (78) = 506 claims'},
  {role:'alg13_verifier_new',               address:'0xb091c4f6fac16edda5ee1e0f4738f80011905878',
   appliesTo:'period 3 realized (315 claims); the NEW variant for all paired replays'},
  {role:'oracle_current',  address:'0x0fc3152971714E5ed7723FAFa650F86A4BaF30C5', appliesTo:'current DNSSECImpl'},
  {role:'oracle_legacy',   address:'0x21745ff62108968fbf5ab1e07961cc0fcbeb2364', appliesTo:'oracle the legacy registrar actually points at'},
  {role:'registrar_current',address:'0xB32cB5677a7C971689228EC835800432B339bA2B', appliesTo:'current DNSRegistrar'},
  {role:'registrar_legacy', address:'0x58774Bb8acD458A640aF0B88238369A167546ef2', appliesTo:'legacy DNSRegistrar'},
];
const head = parseInt(await rpc('eth_blockNumber',[]),16);
const pinned = [];
for (const a of ARTIFACTS) {
  const {value: code, repaired} = await readConfirmed('eth_getCode',[a.address,'latest']);
  const size = (code.length-2)/2;
  if (size === 0) throw new Error(`FATAL: empty bytecode for ${a.role} ${a.address} — false-absent or wrong address`);
  const file = `research/raw/bytecode/${a.role}.hex`;
  fs.writeFileSync(file, code);
  const rec = {...a, runtimeBytecodeKeccak256: keccak(code), sizeBytes: size,
               rawFile: file, rawFileSha256: sha256(code), readRepaired: repaired};
  pinned.push(rec);
  console.log(`${a.role.padEnd(34)} ${a.address}\n   size ${String(size).padStart(5)}B  keccak ${rec.runtimeBytecodeKeccak256}`);
}
const manifest = {
  study:'algorithm13-direct-import-empirical', task:'#f40b5886',
  generatedAtBlock: head, chainId: 1, rpc:'https://evm.stupidtech.net/v1/1',
  overridePolicy:'Paired replay installs DEPLOYED mainnet runtime bytecode via state override. '+
    'No verifier is recompiled from source. Measured delta_gas_i is therefore a delta between '+
    'deployed artifacts as they existed on mainnet, NOT between source revisions.',
  boundaries:{B_precompile:23935694, P_ENS:{block:24619423, txIndex:259, logIndex:584}},
  eip7951:{precompile:'0x0000000000000000000000000000000000000100', measuredGas:6900, specGas:6900,
           note:'PR #509 cites ~3500 from a superseded draft constant; delta_13 ~= 193100 not 196500'},
  artifacts: pinned,
};
fs.writeFileSync('research/manifests/bytecode-pins.json', JSON.stringify(manifest,null,2));
console.log('\nwrote research/manifests/bytecode-pins.json');
