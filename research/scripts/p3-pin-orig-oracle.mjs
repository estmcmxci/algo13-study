import {readConfirmed} from './rpc.mjs';
import {execSync} from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
const keccak=h=>execSync(`cast keccak ${h}`,{maxBuffer:1<<28}).toString().trim();
const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
const ADDR='0x46c6F79952d3046Bf673a28132ff2a81F306959c';
const {value:code}=await readConfirmed('eth_getCode',[ADDR,'latest'],{endpoint:'alchemy'});
const size=(code.length-2)/2;
if(size===0) throw new Error('empty bytecode for original legacy oracle');
const file='research/raw/bytecode/oracle_legacy_original.hex';
fs.writeFileSync(file,code);
const m=JSON.parse(fs.readFileSync('research/manifests/bytecode-pins.json','utf8'));
if(!m.artifacts.find(a=>a.role==='oracle_legacy_original')){
  m.artifacts.push({role:'oracle_legacy_original', address:ADDR,
    appliesTo:'legacy registrar calls with block < 13,103,261 (7 rows). Superseded by 0x21745ff6 when setOracle() ran at that block.',
    runtimeBytecodeKeccak256:keccak(code), sizeBytes:size, rawFile:file, rawFileSha256:sha256(code), readRepaired:false});
  m.correction={note:'oracle_legacy_original added after discovering the legacy registrar migrated oracles at block 13,103,261 via setOracle(). The original map read oracle() at latest and mis-routed 7 rows.',
    migrationBlock:13103261};
  fs.writeFileSync('research/manifests/bytecode-pins.json',JSON.stringify(m,null,2));
}
console.log(`pinned oracle_legacy_original ${ADDR} size ${size}B keccak ${keccak(code)}`);
