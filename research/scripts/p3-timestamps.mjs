import {rpc, readConfirmed} from './rpc.mjs';
import fs from 'node:fs';
const calls=JSON.parse(fs.readFileSync('research/derived/p1-calls-for-decode.json','utf8'));
const failed=JSON.parse(fs.readFileSync('research/derived/p1-failed-calls.json','utf8'));
const blocks=[...new Set([...calls.map(c=>c.block), ...failed.map(f=>f.block_number)])].sort((a,b)=>a-b);
console.log(`distinct blocks needing timestamps: ${blocks.length}`);
const OUT='research/derived/p3-block-timestamps.json';
const have=fs.existsSync(OUT)?JSON.parse(fs.readFileSync(OUT,'utf8')):{};
let n=0;
for(const b of blocks){
  if(have[b]) continue;
  const blk=await rpc('eth_getBlockByNumber',['0x'+b.toString(16),false],{endpoint:'alchemy'});
  if(!blk) throw new Error('null block '+b);
  have[b]={timestamp:parseInt(blk.timestamp,16), hash:blk.hash, parentHash:blk.parentHash,
           baseFeePerGas: blk.baseFeePerGas??null};
  if(++n%200===0){ fs.writeFileSync(OUT,JSON.stringify(have)); process.stdout.write(`\r  ${n}/${blocks.length}  `); }
}
fs.writeFileSync(OUT,JSON.stringify(have));
console.log(`\nwrote ${Object.keys(have).length} block timestamps`);
// sanity: monotonic
const ks=Object.keys(have).map(Number).sort((a,b)=>a-b);
let mono=true; for(let i=1;i<ks.length;i++) if(have[ks[i]].timestamp<=have[ks[i-1]].timestamp) mono=false;
console.log('timestamps strictly increasing with block number?', mono);
