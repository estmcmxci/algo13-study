import {readConfirmed, STATS} from './rpc.mjs';
const ORIG='0x46c6F79952d3046Bf673a28132ff2a81F306959c';
const c13='0xc327deef'+'0d'.padStart(64,'0');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(const b of [13083904,13103260]){
  await sleep(2500);
  const r=await readConfirmed('eth_call',[{to:ORIG,data:c13},'0x'+b.toString(16)],{endpoint:'alchemy'});
  console.log(`  orig oracle 0x46c6F799 @${b}  algorithms(13) = 0x${r.value.slice(26)}`);
}
console.log('alchemy 429s this run:', STATS.alchemy.rateLimited);
