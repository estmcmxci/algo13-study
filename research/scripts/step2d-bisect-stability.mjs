import {rpc} from './rpc.mjs';
const ADDR='0xb091c4f6fac16edda5ee1e0f4738f80011905878';
const TRUTH=24526617;
async function bisect(){
  let lo=0, hi=parseInt(await rpc('eth_blockNumber',[]),16), probes=[];
  while(hi-lo>1){
    const m=Math.floor((lo+hi)/2);
    const c=await rpc('eth_getCode',[ADDR,'0x'+m.toString(16)]);
    probes.push([m,(c.length-2)/2]);
    if(c==='0x')lo=m; else hi=m;
  }
  return {hi,probes};
}
for(let run=1;run<=5;run++){
  const {hi,probes}=await bisect();
  const ok = hi===TRUTH;
  console.log(`run ${run}: creation=${hi} ${ok?'OK':'*** WRONG (truth '+TRUTH+') ***'}`);
  if(!ok){
    // find which probe lied: any probe below TRUTH that reported non-zero size
    const liars=probes.filter(([b,s])=>b<TRUTH && s>0);
    console.log('   lying probes (block < creation but reported code):', liars);
  }
}
