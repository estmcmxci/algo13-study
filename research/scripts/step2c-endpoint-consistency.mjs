import {rpc} from './rpc.mjs';
const ADDR='0xb091c4f6fac16edda5ee1e0f4738f80011905878';
// Ground truth: code MUST be empty at 20000000 (created 24526617)
const N=40;
let empty=0, nonempty=0, err=0; const sizes={};
for(let i=0;i<N;i++){
  try{
    const c=await rpc('eth_getCode',[ADDR,'0x'+(20000000).toString(16)],{retries:1});
    const sz=(c.length-2)/2; sizes[sz]=(sizes[sz]||0)+1;
    if(sz===0) empty++; else nonempty++;
  }catch(e){err++;}
}
console.log(`eth_getCode(p256New @20,000,000) x${N}  [truth: MUST be 0 bytes]`);
console.log(`  correct(empty)=${empty}  WRONG(non-empty)=${nonempty}  errors=${err}`);
console.log(`  size histogram:`, sizes);

// Same test on a historical balance with known value
let vals={};
for(let i=0;i<20;i++){
  try{ const b=await rpc('eth_getBalance',['0x0000000000000000000000000000000000000000','0xf4240'],{retries:1});
       vals[b]=(vals[b]||0)+1; }catch(e){ vals['ERR']=(vals['ERR']||0)+1; }
}
console.log(`\neth_getBalance(0x0 @1,000,000) x20 distinct answers:`, vals);
