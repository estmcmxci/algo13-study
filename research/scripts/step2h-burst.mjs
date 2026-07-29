import {rpc} from './rpc.mjs';
const ADDR='0xb091c4f6fac16edda5ee1e0f4738f80011905878';
const BLOCK='0x'+(24600000).toString(16); // code exists (1039B)
const N=200; const fails=[];
for(let i=0;i<N;i++){
  try{ const c=await rpc('eth_getCode',[ADDR,BLOCK],{retries:1}); if((c.length-2)/2===0) fails.push(i); }
  catch(e){ fails.push(i+'E'); }
}
console.log(`rapid, no delay: ${fails.length}/${N} false-empty  rate ${(100*fails.length/N).toFixed(1)}%`);
console.log('  failure indices:', fails.join(','));
// gap analysis
const nums=fails.filter(f=>typeof f==='number');
if(nums.length>1){const gaps=nums.slice(1).map((v,i)=>v-nums[i]);console.log('  gaps between failures:',gaps.join(','));}
// with 250ms spacing
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let f2=0;
for(let i=0;i<60;i++){ await sleep(250);
  try{const c=await rpc('eth_getCode',[ADDR,BLOCK],{retries:1}); if((c.length-2)/2===0) f2++;}catch(e){f2++;}}
console.log(`\nwith 250ms spacing: ${f2}/60 false-empty  rate ${(100*f2/60).toFixed(1)}%`);
